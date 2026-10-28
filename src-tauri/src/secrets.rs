//! Provider secrets handed to Traits during a call. Outside the OS keychain a secret lives
//! only in memory and prints as `[redacted]`, so it cannot leak through `Debug` output, logs
//! or error messages.

use std::sync::OnceLock;

use crate::error::{AppError, AppResult};
use crate::link::REDACTED;

/// The AI providers, by ID, with the name shown to the user.
pub const PROVIDERS: [(&str, &str); 4] = [
    ("openai", "OpenAI"),
    ("anthropic", "Anthropic"),
    ("google", "Google"),
    ("openrouter", "OpenRouter"),
];

/// Every key the keychain holds: the AI providers, Typesafe for routing, and the Ai2
/// account's tokens for Asta.
const KEY_ACCOUNTS: [(&str, &str); 6] = [
    PROVIDERS[0],
    PROVIDERS[1],
    PROVIDERS[2],
    PROVIDERS[3],
    ("typesafe", "Typesafe"),
    ("ai2", "Ai2"),
];

/// The keychain service Mini-Me's entries are stored under, one per key account, used until
/// `use_keychain_service` names the running app's.
const DEFAULT_KEYCHAIN_SERVICE: &str = "org.cipotato.mini-me";
static KEYCHAIN_SERVICE: OnceLock<String> = OnceLock::new();

/// Stores keychain entries under `service`, the running app's identifier, so Mini-Me Dev's
/// keys stay apart from Mini-Me's. Only the first call takes effect.
pub fn use_keychain_service(service: &str) {
    let _ = KEYCHAIN_SERVICE.set(service.to_string());
}

fn keychain_service() -> &'static str {
    KEYCHAIN_SERVICE.get().map_or(DEFAULT_KEYCHAIN_SERVICE, String::as_str)
}

pub fn provider_name(id: &str) -> &str {
    KEY_ACCOUNTS
        .iter()
        .find(|(account, _)| *account == id)
        .map_or(id, |(_, name)| name)
}

/// Whether `id` is an AI provider a model can be chosen from.
pub fn is_provider(id: &str) -> bool {
    PROVIDERS.iter().any(|(provider, _)| *provider == id)
}

/// Whether the keychain may hold a key for `id`.
pub fn is_key_account(id: &str) -> bool {
    KEY_ACCOUNTS.iter().any(|(account, _)| *account == id)
}

pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// The secret itself. Use it only to build the `secret.get` response.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(REDACTED)
    }
}

impl std::fmt::Display for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(REDACTED)
    }
}

/// Where the core looks up a provider's secret.
pub trait SecretSource: Send + Sync {
    fn get(&self, provider: &str) -> Option<Secret>;
}

/// A source with no secrets: every lookup finds nothing.
#[cfg(test)]
pub struct NoSecrets;

#[cfg(test)]
impl SecretSource for NoSecrets {
    fn get(&self, _provider: &str) -> Option<Secret> {
        None
    }
}

/// API keys in the OS keychain (Windows Credential Manager, macOS Keychain). Read on every
/// request and never cached, so a key removed in Settings stops working at once.
pub struct KeychainSecrets;

impl KeychainSecrets {
    fn entry(provider: &str) -> AppResult<keyring::Entry> {
        if !is_key_account(provider) {
            return Err(AppError::invalid_input(format!("Unknown provider {provider:?}.")));
        }
        keyring::Entry::new(keychain_service(), provider).map_err(keychain_error)
    }

    pub fn save(provider: &str, key: &str) -> AppResult<()> {
        let key = key.trim();
        if key.is_empty() {
            return Err(AppError::invalid_input("The API key is empty."));
        }
        Self::entry(provider)?.set_password(key).map_err(keychain_error)
    }

    /// Removes the key; does nothing if there is none.
    pub fn remove(provider: &str) -> AppResult<()> {
        match Self::entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(keychain_error(e)),
        }
    }

    /// The key accounts that have a saved key.
    pub fn saved() -> Vec<String> {
        KEY_ACCOUNTS
            .iter()
            .filter(|(provider, _)| KeychainSecrets.get(provider).is_some())
            .map(|(provider, _)| provider.to_string())
            .collect()
    }
}

impl SecretSource for KeychainSecrets {
    fn get(&self, provider: &str) -> Option<Secret> {
        Self::entry(provider).ok()?.get_password().ok().map(Secret::new)
    }
}

/// Keychain errors carry no secret, only what went wrong.
fn keychain_error(error: keyring::Error) -> AppError {
    AppError::new("keychain", format!("The system keychain could not be used: {error}"))
}

#[cfg(test)]
pub mod test_support {
    use std::collections::HashMap;

    use super::*;

    pub struct MemorySecrets(pub HashMap<String, String>);

    impl MemorySecrets {
        pub fn dummy() -> Self {
            Self(HashMap::from([("dummy".to_string(), "sk-dummy-0123456789".to_string())]))
        }
    }

    impl SecretSource for MemorySecrets {
        fn get(&self, provider: &str) -> Option<Secret> {
            self.0.get(provider).map(Secret::new)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_use_mini_mes_service_until_the_app_names_its_own() {
        // No test sets the service, which the running app does once at start-up.
        assert_eq!(keychain_service(), "org.cipotato.mini-me");
    }

    #[test]
    fn secrets_print_redacted() {
        let secret = Secret::new("sk-dummy-0123456789");
        assert_eq!(format!("{secret:?}"), REDACTED);
        assert_eq!(format!("{secret}"), REDACTED);
        assert_eq!(secret.expose(), "sk-dummy-0123456789");
    }

    #[test]
    fn providers_have_names_and_unknown_ones_are_refused() {
        assert_eq!(provider_name("openrouter"), "OpenRouter");
        assert_eq!(provider_name("dummy"), "dummy");
        assert!(is_provider("google"));
        assert_eq!(provider_name("typesafe"), "Typesafe");
        assert!(is_key_account("typesafe"));
        assert!(!is_provider("typesafe"));
        assert_eq!(
            KeychainSecrets::save("dummy", "sk-1").unwrap_err().code,
            "invalid_input"
        );
        assert_eq!(KeychainSecrets::save("openai", "  ").unwrap_err().code, "invalid_input");
    }
}
