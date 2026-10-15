//! The user's Ai2 account, which Asta's services need: signing in with Auth0's device flow,
//! keeping the tokens in the OS keychain, and handing adapters a current access token. The
//! refresh token never leaves the Rust core.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::protocol::now_ms;
use crate::secrets::{KeychainSecrets, Secret, SecretSource};

/// The key account the tokens are stored under, and the provider adapters ask for.
pub const AI2_ACCOUNT: &str = "ai2";

/// Asta's Auth0 tenant and its public client, as configured in `asta.conf`.
const AUTH0_URL: &str = "https://auth0.allenai.org";
const CLIENT_ID: &str = "NkhOb7B3oTpajykCAD1rjI2ZHAKV8Q3B";
const AUDIENCE: &str = "https://asta-core.allen.ai";
const SCOPES: &str = "openid profile email offline_access access:all";

/// An access token this close to expiring is refreshed before use.
const REFRESH_MARGIN_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Unix milliseconds.
    pub expires_at: i64,
    pub email: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Ai2Status {
    SignedOut { error: Option<String> },
    /// Waiting for the user to confirm `user_code` at `verification_uri`.
    Pending {
        user_code: String,
        verification_uri: String,
    },
    SignedIn { email: Option<String> },
}

/// Auth0's answer to a device-code or token request.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Seconds.
    pub expires_in: i64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    /// Seconds.
    pub expires_in: u64,
    /// Seconds between polls.
    #[serde(default = "default_interval")]
    pub interval: u64,
}

fn default_interval() -> u64 {
    5
}

/// The outcome of one poll while the user confirms the code.
#[derive(Debug, Clone, PartialEq)]
pub enum Poll {
    Done(TokenResponse),
    Pending,
    SlowDown,
    Failed(String),
}

/// Auth0's endpoints. Tests replace them with a fake.
pub trait Auth0: Send + Sync {
    fn device_code(&self) -> AppResult<DeviceCode>;
    fn poll(&self, device_code: &str) -> AppResult<Poll>;
    fn refresh(&self, refresh_token: &str) -> AppResult<TokenResponse>;
    fn email(&self, access_token: &str) -> Option<String>;
}

/// Where the tokens are kept. Tests use memory instead of the OS keychain.
pub trait TokenStore: Send + Sync {
    fn load(&self) -> Option<Tokens>;
    fn save(&self, tokens: &Tokens) -> AppResult<()>;
    fn delete(&self) -> AppResult<()>;
}

type StatusSink = Box<dyn Fn(&Ai2Status) -> bool + Send>;

pub struct Ai2 {
    auth0: Box<dyn Auth0>,
    store: Box<dyn TokenStore>,
    status: Mutex<Ai2Status>,
    subscribers: Mutex<Vec<StatusSink>>,
    /// Serializes refreshes: a rotated refresh token is single-use, so two calls must not
    /// refresh with the same one.
    refreshing: Mutex<()>,
}

impl Ai2 {
    pub fn new(auth0: Box<dyn Auth0>, store: Box<dyn TokenStore>) -> Arc<Self> {
        let status = match store.load() {
            Some(tokens) => Ai2Status::SignedIn {
                email: tokens.email,
            },
            None => Ai2Status::SignedOut { error: None },
        };
        Arc::new(Self {
            auth0,
            store,
            status: Mutex::new(status),
            subscribers: Mutex::new(Vec::new()),
            refreshing: Mutex::new(()),
        })
    }

    /// The account backed by Asta's Auth0 tenant and the OS keychain.
    pub fn system() -> Arc<Self> {
        Self::new(Box::new(HttpAuth0), Box::new(KeychainStore))
    }

    pub fn status(&self) -> Ai2Status {
        self.status.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    /// Sends the current status to `sink` and then every change. `sink` returns `false`
    /// when it is gone.
    pub fn subscribe(&self, sink: StatusSink) {
        let status = self.status.lock().unwrap_or_else(|p| p.into_inner());
        if sink(&*status) {
            self.subscribers
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .push(sink);
        }
    }

    fn set_status(&self, status: Ai2Status) {
        let mut current = self.status.lock().unwrap_or_else(|p| p.into_inner());
        *current = status;
        self.subscribers
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .retain(|sink| sink(&*current));
    }

    /// Starts the device flow and waits for the user's confirmation on a background thread.
    /// Returns the page the user confirms the code on.
    pub fn start_sign_in(self: &Arc<Self>) -> AppResult<String> {
        let code = self.auth0.device_code()?;
        let page = code
            .verification_uri_complete
            .clone()
            .unwrap_or_else(|| code.verification_uri.clone());
        self.set_status(Ai2Status::Pending {
            user_code: code.user_code.clone(),
            verification_uri: code.verification_uri.clone(),
        });
        let this = Arc::clone(self);
        std::thread::spawn(move || this.wait_for_confirmation(&code));
        Ok(page)
    }

    fn wait_for_confirmation(&self, code: &DeviceCode) {
        let deadline = now_ms() + code.expires_in as i64 * 1000;
        let mut interval = Duration::from_secs(code.interval);
        while now_ms() < deadline {
            std::thread::sleep(interval);
            if !matches!(self.status(), Ai2Status::Pending { .. }) {
                return;
            }
            match self.auth0.poll(&code.device_code) {
                Ok(Poll::Pending) => {}
                Ok(Poll::SlowDown) => interval += Duration::from_secs(5),
                Ok(Poll::Done(response)) => {
                    let email = self.auth0.email(&response.access_token);
                    let tokens = tokens_from(response, None, email);
                    let status = match self.store.save(&tokens) {
                        Ok(()) => Ai2Status::SignedIn {
                            email: tokens.email,
                        },
                        Err(err) => Ai2Status::SignedOut {
                            error: Some(err.message),
                        },
                    };
                    self.set_status(status);
                    return;
                }
                Ok(Poll::Failed(reason)) => {
                    self.set_status(Ai2Status::SignedOut {
                        error: Some(reason),
                    });
                    return;
                }
                Err(err) => {
                    self.set_status(Ai2Status::SignedOut {
                        error: Some(err.message),
                    });
                    return;
                }
            }
        }
        self.set_status(Ai2Status::SignedOut {
            error: Some("The sign-in code expired. Sign in again.".to_string()),
        });
    }

    pub fn sign_out(&self) -> AppResult<()> {
        self.store.delete()?;
        self.set_status(Ai2Status::SignedOut { error: None });
        Ok(())
    }

    /// A current access token, refreshed first when it is about to expire; `None` when not
    /// signed in or when the refresh failed.
    pub fn access_token(&self) -> Option<String> {
        let _refreshing = self.refreshing.lock().unwrap_or_else(|p| p.into_inner());
        let tokens = self.store.load()?;
        if now_ms() < tokens.expires_at - REFRESH_MARGIN_MS {
            return Some(tokens.access_token);
        }
        let refresh_token = tokens.refresh_token.clone()?;
        let response = self.auth0.refresh(&refresh_token).ok()?;
        let refreshed = tokens_from(response, Some(&tokens), tokens.email.clone());
        self.store.save(&refreshed).ok()?;
        Some(refreshed.access_token)
    }
}

/// Stored tokens from Auth0's response. Auth0 may leave out the refresh token on a refresh,
/// in which case the previous one stays valid.
fn tokens_from(response: TokenResponse, previous: Option<&Tokens>, email: Option<String>) -> Tokens {
    Tokens {
        access_token: response.access_token,
        refresh_token: response
            .refresh_token
            .or_else(|| previous.and_then(|p| p.refresh_token.clone())),
        expires_at: now_ms() + response.expires_in * 1000,
        email,
    }
}

/// Secrets for adapters: the Ai2 access token from the account, every other key from the OS
/// keychain.
pub struct AppSecrets {
    pub ai2: Arc<Ai2>,
}

impl SecretSource for AppSecrets {
    fn get(&self, provider: &str) -> Option<Secret> {
        if provider == AI2_ACCOUNT {
            return self.ai2.access_token().map(Secret::new);
        }
        KeychainSecrets.get(provider)
    }
}

struct KeychainStore;

impl TokenStore for KeychainStore {
    fn load(&self) -> Option<Tokens> {
        let raw = KeychainSecrets.get(AI2_ACCOUNT)?;
        serde_json::from_str(raw.expose()).ok()
    }

    fn save(&self, tokens: &Tokens) -> AppResult<()> {
        KeychainSecrets::save(AI2_ACCOUNT, &serde_json::to_string(tokens)?)
    }

    fn delete(&self) -> AppResult<()> {
        KeychainSecrets::remove(AI2_ACCOUNT)
    }
}

/// Auth0 over HTTPS. Calls block, so they run on plain threads: `reqwest`'s blocking client
/// must not run inside the async runtime that Tauri commands use.
struct HttpAuth0;

impl HttpAuth0 {
    fn post(path: &str, form: Vec<(&'static str, String)>) -> AppResult<(u16, Value)> {
        let url = format!("{AUTH0_URL}{path}");
        off_runtime(move || {
            let response = reqwest::blocking::Client::new()
                .post(url)
                .form(&form)
                .timeout(Duration::from_secs(30))
                .send()
                .map_err(network_error)?;
            let status = response.status().as_u16();
            let body = response.json::<Value>().unwrap_or(Value::Null);
            Ok((status, body))
        })
    }
}

impl Auth0 for HttpAuth0 {
    fn device_code(&self) -> AppResult<DeviceCode> {
        let (status, body) = Self::post(
            "/oauth/device/code",
            vec![
                ("client_id", CLIENT_ID.to_string()),
                ("scope", SCOPES.to_string()),
                ("audience", AUDIENCE.to_string()),
            ],
        )?;
        if status != 200 {
            return Err(AppError::new("ai2_auth", "Ai2 refused to start the sign-in."));
        }
        Ok(serde_json::from_value(body)?)
    }

    fn poll(&self, device_code: &str) -> AppResult<Poll> {
        let (status, body) = Self::post(
            "/oauth/token",
            vec![
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code".to_string()),
                ("device_code", device_code.to_string()),
                ("client_id", CLIENT_ID.to_string()),
            ],
        )?;
        if status == 200 {
            return Ok(Poll::Done(serde_json::from_value(body)?));
        }
        Ok(match body["error"].as_str().unwrap_or_default() {
            "authorization_pending" => Poll::Pending,
            "slow_down" => Poll::SlowDown,
            "access_denied" => Poll::Failed("The sign-in was declined.".to_string()),
            "expired_token" => Poll::Failed("The sign-in code expired. Sign in again.".to_string()),
            _ => Poll::Failed("Ai2 could not complete the sign-in. Try again.".to_string()),
        })
    }

    fn refresh(&self, refresh_token: &str) -> AppResult<TokenResponse> {
        let (status, body) = Self::post(
            "/oauth/token",
            vec![
                ("grant_type", "refresh_token".to_string()),
                ("client_id", CLIENT_ID.to_string()),
                ("refresh_token", refresh_token.to_string()),
            ],
        )?;
        if status != 200 {
            return Err(AppError::new("ai2_auth", "Ai2 did not renew the sign-in."));
        }
        Ok(serde_json::from_value(body)?)
    }

    fn email(&self, access_token: &str) -> Option<String> {
        let url = format!("{AUTH0_URL}/userinfo");
        let token = access_token.to_string();
        off_runtime(move || {
            let response = reqwest::blocking::Client::new()
                .get(url)
                .bearer_auth(token)
                .timeout(Duration::from_secs(30))
                .send()
                .map_err(network_error)?;
            let body = response.json::<Value>().map_err(network_error)?;
            Ok(body["email"].as_str().map(str::to_string))
        })
        .ok()
        .flatten()
    }
}

fn network_error(err: reqwest::Error) -> AppError {
    AppError::new("ai2_unavailable", format!("Ai2 could not be reached: {err}"))
}

/// Runs `work` on a plain thread and waits for it.
fn off_runtime<T: Send + 'static>(work: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    std::thread::spawn(work)
        .join()
        .unwrap_or_else(|_| Err(AppError::new("ai2_unavailable", "The Ai2 request failed.")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryStore(Mutex<Option<Tokens>>);

    impl TokenStore for MemoryStore {
        fn load(&self) -> Option<Tokens> {
            self.0.lock().unwrap().clone()
        }
        fn save(&self, tokens: &Tokens) -> AppResult<()> {
            *self.0.lock().unwrap() = Some(tokens.clone());
            Ok(())
        }
        fn delete(&self) -> AppResult<()> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    /// Answers polls from a script and counts refreshes.
    struct FakeAuth0 {
        polls: Mutex<Vec<Poll>>,
        refresh_ok: bool,
        refreshed: Mutex<Vec<String>>,
    }

    impl FakeAuth0 {
        fn new(polls: Vec<Poll>, refresh_ok: bool) -> Self {
            Self {
                polls: Mutex::new(polls),
                refresh_ok,
                refreshed: Mutex::new(Vec::new()),
            }
        }
    }

    impl Auth0 for FakeAuth0 {
        fn device_code(&self) -> AppResult<DeviceCode> {
            Ok(DeviceCode {
                device_code: "dev".into(),
                user_code: "ABCD-EFGH".into(),
                verification_uri: "https://example.org/activate".into(),
                verification_uri_complete: None,
                expires_in: 5,
                interval: 0,
            })
        }
        fn poll(&self, _device_code: &str) -> AppResult<Poll> {
            let mut polls = self.polls.lock().unwrap();
            Ok(if polls.is_empty() { Poll::Pending } else { polls.remove(0) })
        }
        fn refresh(&self, refresh_token: &str) -> AppResult<TokenResponse> {
            self.refreshed.lock().unwrap().push(refresh_token.to_string());
            if !self.refresh_ok {
                return Err(AppError::new("ai2_auth", "no"));
            }
            Ok(TokenResponse {
                access_token: "new-access".into(),
                refresh_token: Some("rotated".into()),
                expires_in: 3600,
            })
        }
        fn email(&self, _access_token: &str) -> Option<String> {
            Some("scientist@cgiar.org".into())
        }
    }

    fn tokens(expires_in_ms: i64) -> Tokens {
        Tokens {
            access_token: "old-access".into(),
            refresh_token: Some("refresh-1".into()),
            expires_at: now_ms() + expires_in_ms,
            email: Some("scientist@cgiar.org".into()),
        }
    }

    fn account(auth0: FakeAuth0, stored: Option<Tokens>) -> Arc<Ai2> {
        let store = MemoryStore(Mutex::new(stored));
        Ai2::new(Box::new(auth0), Box::new(store))
    }

    fn wait_until(ai2: &Ai2, done: impl Fn(&Ai2Status) -> bool) -> Ai2Status {
        for _ in 0..200 {
            let status = ai2.status();
            if done(&status) {
                return status;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("status never changed: {:?}", ai2.status());
    }

    #[test]
    fn tokens_round_trip_as_json() {
        let original = tokens(1000);
        let json = serde_json::to_string(&original).unwrap();
        assert_eq!(serde_json::from_str::<Tokens>(&json).unwrap(), original);
    }

    #[test]
    fn signing_in_goes_from_pending_to_signed_in() {
        let done = Poll::Done(TokenResponse {
            access_token: "a".into(),
            refresh_token: Some("r".into()),
            expires_in: 3600,
        });
        let ai2 = account(FakeAuth0::new(vec![Poll::Pending, done], true), None);
        assert_eq!(ai2.status(), Ai2Status::SignedOut { error: None });
        assert_eq!(ai2.start_sign_in().unwrap(), "https://example.org/activate");
        assert!(matches!(ai2.status(), Ai2Status::Pending { ref user_code, .. } if user_code == "ABCD-EFGH"));
        let status = wait_until(&ai2, |s| matches!(s, Ai2Status::SignedIn { .. }));
        assert_eq!(
            status,
            Ai2Status::SignedIn {
                email: Some("scientist@cgiar.org".into())
            }
        );
        assert_eq!(ai2.access_token().as_deref(), Some("a"));
        ai2.sign_out().unwrap();
        assert_eq!(ai2.access_token(), None);
    }

    #[test]
    fn a_declined_sign_in_is_reported() {
        let declined = Poll::Failed("The sign-in was declined.".into());
        let ai2 = account(FakeAuth0::new(vec![declined], true), None);
        ai2.start_sign_in().unwrap();
        let status = wait_until(&ai2, |s| matches!(s, Ai2Status::SignedOut { error: Some(_) }));
        assert_eq!(
            status,
            Ai2Status::SignedOut {
                error: Some("The sign-in was declined.".into())
            }
        );
    }

    #[test]
    fn an_expiring_token_is_refreshed_and_the_rotated_token_kept() {
        let ai2 = account(FakeAuth0::new(Vec::new(), true), Some(tokens(60_000)));
        assert_eq!(ai2.access_token().as_deref(), Some("new-access"));
        let stored = ai2.store.load().unwrap();
        assert_eq!(stored.refresh_token.as_deref(), Some("rotated"));
        assert!(stored.expires_at > now_ms() + REFRESH_MARGIN_MS);
        assert_eq!(ai2.access_token().as_deref(), Some("new-access"));
    }

    #[test]
    fn a_fresh_token_is_used_as_is_and_a_failed_refresh_gives_none() {
        let fresh = account(FakeAuth0::new(Vec::new(), true), Some(tokens(3_600_000)));
        assert_eq!(fresh.access_token().as_deref(), Some("old-access"));

        let failing = account(FakeAuth0::new(Vec::new(), false), Some(tokens(1000)));
        assert_eq!(failing.access_token(), None);
        assert_eq!(failing.store.load().unwrap().refresh_token.as_deref(), Some("refresh-1"));
    }
}
