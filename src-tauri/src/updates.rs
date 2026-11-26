//! Updates to a newer published release: the periodic check, the download, the status shown
//! to the user, and installing on restart or on close.

use std::sync::{Arc, Mutex};
use std::time::Duration;

#[cfg(target_os = "macos")]
use core_foundation::{base::TCFType, url::CFURL, url::CFURLRef};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::sidecar::SidecarLog;
use crate::sync::{Sink, Watched, locked};

const CHECK_INTERVAL: Duration = Duration::from_secs(4 * 60 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum UpdateStatus {
    None,
    Downloading { version: String, percent: Option<u8> },
    Ready { version: String },
}

type StatusSink = Sink<UpdateStatus>;

/// Whole percent of `downloaded` out of `total`, 100 only once complete; `None` without a total.
fn percent(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|&t| t > 0)?;
    Some((downloaded.min(total) * 100 / total) as u8)
}

#[cfg(target_os = "macos")]
#[link(name = "CoreServices", kind = "framework")]
unsafe extern "C" {
    fn LSRegisterURL(url: CFURLRef, update: u8) -> i32;
}

/// Makes LaunchServices re-read the app bundle after an update. The restart goes through
/// `open`, which launches the version LaunchServices has on record, and that record keeps the
/// replaced version until something refreshes it.
#[cfg(target_os = "macos")]
fn register_bundle(log: &SidecarLog) {
    // The executable is at <bundle>.app/Contents/MacOS/<name>.
    let bundle = tauri::utils::platform::current_exe()
        .ok()
        .and_then(|exe| exe.ancestors().nth(3).map(|p| p.to_path_buf()))
        .filter(|p| p.extension().is_some_and(|e| e == "app"));
    let Some(url) = bundle.and_then(|b| CFURL::from_path(b, true)) else {
        log.line("update: app bundle not found, LaunchServices not refreshed");
        return;
    };
    let status = unsafe { LSRegisterURL(url.as_concrete_TypeRef(), 1) };
    if status != 0 {
        log.line(&format!("update: LaunchServices refresh failed ({status})"));
    }
}

pub struct Updates {
    log: Arc<SidecarLog>,
    status: Watched<UpdateStatus>,
    /// A downloaded and verified update, held in memory until it is installed.
    pending: Mutex<Option<(Update, Vec<u8>)>>,
}

impl Updates {
    pub fn new(log: Arc<SidecarLog>) -> Arc<Self> {
        Arc::new(Self {
            log,
            status: Watched::new(UpdateStatus::None),
            pending: Mutex::new(None),
        })
    }

    pub fn status(&self) -> UpdateStatus {
        self.status.get()
    }

    /// Sends the current status, then every change; `sink` returns `false` once gone.
    pub fn subscribe(&self, sink: StatusSink) {
        self.status.subscribe(sink);
    }

    /// Checks now and then every `CHECK_INTERVAL`, on a background thread.
    pub fn spawn(self: &Arc<Self>, app: AppHandle) {
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            loop {
                if this.should_check() {
                    if let Err(e) = tauri::async_runtime::block_on(this.check(&app)) {
                        this.check_failed(&e.to_string());
                    }
                }
                std::thread::sleep(CHECK_INTERVAL);
            }
        });
    }

    /// Installs the downloaded update, if any; `true` when it was installed. On Windows this
    /// starts the installer and ends the process, so the sidecar must already be stopped.
    pub fn install_pending(&self) -> bool {
        let Some((update, bytes)) = locked(&self.pending).take()
        else {
            return false;
        };
        self.log.line(&format!("update: installing {}", update.version));
        match update.install(bytes) {
            Ok(()) => {
                #[cfg(target_os = "macos")]
                register_bundle(&self.log);
                true
            }
            Err(e) => {
                self.log.line(&format!("update: install failed: {e}"));
                false
            }
        }
    }

    /// A download in progress or one waiting for a restart is not checked again.
    fn should_check(&self) -> bool {
        self.status() == UpdateStatus::None
    }

    fn check_failed(&self, error: &str) {
        self.log.line(&format!("update: check or download failed: {error}"));
        self.set_status(UpdateStatus::None);
    }

    async fn check(&self, app: &AppHandle) -> tauri_plugin_updater::Result<()> {
        let Some(update) = app.updater()?.check().await? else {
            return Ok(());
        };
        let version = update.version.clone();
        self.log.line(&format!("update: downloading {version}"));
        self.set_status(UpdateStatus::Downloading {
            version: version.clone(),
            percent: None,
        });
        let mut downloaded = 0u64;
        // `download` verifies the signature against the public key in the app's config.
        let bytes = update
            .download(
                |chunk, total| {
                    downloaded += chunk as u64;
                    self.set_status(UpdateStatus::Downloading {
                        version: version.clone(),
                        percent: percent(downloaded, total),
                    });
                },
                || {},
            )
            .await?;
        *locked(&self.pending) = Some((update, bytes));
        self.log.line(&format!("update: {version} ready"));
        self.set_status(UpdateStatus::Ready { version });
        Ok(())
    }

    /// Publishes `status` only when it differs from the current one, so download progress
    /// reaches the UI at most once per percent.
    fn set_status(&self, status: UpdateStatus) {
        self.status.set(status);
    }
}
