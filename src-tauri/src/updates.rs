//! Updates to a newer published release: the periodic check, the download, the status shown
//! to the user, and installing on restart or on close.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::sidecar::SidecarLog;

const CHECK_INTERVAL: Duration = Duration::from_secs(4 * 60 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum UpdateStatus {
    None,
    Downloading { version: String, percent: Option<u8> },
    Ready { version: String },
}

type StatusSink = Box<dyn Fn(&UpdateStatus) -> bool + Send>;

/// Whole percent of `downloaded` out of `total`; `None` when the total is unknown. Reaches
/// 100 only once everything has arrived.
fn percent(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|&t| t > 0)?;
    Some((downloaded.min(total) * 100 / total) as u8)
}

pub struct Updates {
    log: Arc<SidecarLog>,
    status: Mutex<UpdateStatus>,
    subscribers: Mutex<Vec<StatusSink>>,
    /// A downloaded and verified update, held in memory until it is installed.
    pending: Mutex<Option<(Update, Vec<u8>)>>,
}

impl Updates {
    pub fn new(log: Arc<SidecarLog>) -> Arc<Self> {
        Arc::new(Self {
            log,
            status: Mutex::new(UpdateStatus::None),
            subscribers: Mutex::new(Vec::new()),
            pending: Mutex::new(None),
        })
    }

    pub fn status(&self) -> UpdateStatus {
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
        let Some((update, bytes)) = self.pending.lock().unwrap_or_else(|p| p.into_inner()).take()
        else {
            return false;
        };
        self.log.line(&format!("update: installing {}", update.version));
        match update.install(bytes) {
            Ok(()) => true,
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
        *self.pending.lock().unwrap_or_else(|p| p.into_inner()) = Some((update, bytes));
        self.log.line(&format!("update: {version} ready"));
        self.set_status(UpdateStatus::Ready { version });
        Ok(())
    }

    /// Publishes `status` only when it differs from the current one, so download progress
    /// reaches the UI at most once per percent.
    fn set_status(&self, status: UpdateStatus) {
        let mut current = self.status.lock().unwrap_or_else(|p| p.into_inner());
        if *current == status {
            return;
        }
        *current = status;
        self.subscribers
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .retain(|sink| sink(&*current));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn downloading(percent: Option<u8>) -> UpdateStatus {
        UpdateStatus::Downloading {
            version: "0.3.0".into(),
            percent,
        }
    }

    #[test]
    fn percent_is_whole_and_reaches_100_only_when_complete() {
        assert_eq!(percent(0, Some(1000)), Some(0));
        assert_eq!(percent(999, Some(1000)), Some(99));
        assert_eq!(percent(1000, Some(1000)), Some(100));
        assert_eq!(percent(1500, Some(1000)), Some(100));
    }

    #[test]
    fn percent_is_none_without_a_total() {
        assert_eq!(percent(500, None), None);
        assert_eq!(percent(500, Some(0)), None);
    }

    #[test]
    fn status_is_published_only_when_it_changes() {
        let updates = Updates::new(Arc::new(SidecarLog::disabled()));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink_seen = Arc::clone(&seen);
        updates.subscribe(Box::new(move |status| {
            sink_seen.lock().unwrap().push(status.clone());
            true
        }));
        updates.set_status(downloading(Some(1)));
        updates.set_status(downloading(Some(1)));
        updates.set_status(downloading(Some(2)));
        assert_eq!(
            *seen.lock().unwrap(),
            vec![UpdateStatus::None, downloading(Some(1)), downloading(Some(2))]
        );
    }

    #[test]
    fn failed_download_returns_to_none_and_is_checked_again() {
        let updates = Updates::new(Arc::new(SidecarLog::disabled()));
        updates.set_status(downloading(Some(40)));
        assert!(!updates.should_check());
        updates.check_failed("connection reset");
        assert_eq!(updates.status(), UpdateStatus::None);
        assert!(updates.should_check());
    }

    #[test]
    fn ready_update_skips_the_next_check() {
        let updates = Updates::new(Arc::new(SidecarLog::disabled()));
        updates.set_status(UpdateStatus::Ready {
            version: "0.3.0".into(),
        });
        assert!(!updates.should_check());
    }

    #[test]
    fn nothing_to_install_without_a_download() {
        let updates = Updates::new(Arc::new(SidecarLog::disabled()));
        assert!(!updates.install_pending());
    }
}
