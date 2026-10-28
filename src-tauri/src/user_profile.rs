//! What Mini-Me knows about its user, stored app-wide in `user-profile.json` in the Mini-Me
//! Data folder. The file never lives in a Project folder, no Trait tool can address it, and
//! nothing in it is sent to the sidecar.

use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::Serialize;
use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};

pub const FILE_NAME: &str = "user-profile.json";

/// The longest name, in characters, after trimming.
const MAX_NAME_CHARS: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UserProfile {
    pub name: Option<String>,
    /// Why the file could not be read; while set, saves are refused.
    pub unreadable: Option<String>,
}

struct State {
    /// The whole file, so keys this version does not know are written back unchanged.
    raw: Map<String, Value>,
    unreadable: Option<String>,
}

pub struct ProfileStore {
    path: PathBuf,
    state: RwLock<State>,
}

impl ProfileStore {
    /// The profile in `data_root`; the file is created on the first save.
    pub fn open(data_root: &Path) -> Self {
        let path = data_root.join(FILE_NAME);
        let state = load(&path);
        Self { path, state: RwLock::new(state) }
    }

    pub fn current(&self) -> UserProfile {
        let state = self.state.read().unwrap_or_else(|e| e.into_inner());
        UserProfile {
            name: name_of(&state.raw),
            unreadable: state.unreadable.clone(),
        }
    }

    /// Saves `name` trimmed, or clears it when it is empty, returning the saved profile.
    pub fn save_name(&self, name: &str) -> AppResult<UserProfile> {
        let name = name.trim();
        if name.chars().count() > MAX_NAME_CHARS {
            return Err(AppError::invalid_input(format!(
                "A name can be at most {MAX_NAME_CHARS} characters."
            )));
        }
        {
            let mut state = self.state.write().unwrap_or_else(|e| e.into_inner());
            if state.unreadable.is_some() {
                return Err(AppError::storage(format!(
                    "{FILE_NAME} could not be read, so it is left unchanged. Fix or remove it, then restart Mini-Me."
                )));
            }
            let mut raw = state.raw.clone();
            if name.is_empty() {
                raw.remove("name");
            } else {
                raw.insert("name".into(), Value::String(name.into()));
            }
            write(&self.path, &raw)?;
            state.raw = raw;
        }
        Ok(self.current())
    }
}

fn name_of(raw: &Map<String, Value>) -> Option<String> {
    raw.get("name").and_then(Value::as_str).map(str::to_string)
}

fn load(path: &Path) -> State {
    let unreadable = |reason: String| State { raw: Map::new(), unreadable: Some(reason) };
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return State { raw: Map::new(), unreadable: None };
        }
        Err(e) => return unreadable(e.to_string()),
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(raw)) => match raw.get("name") {
            None | Some(Value::String(_)) => State { raw, unreadable: None },
            Some(_) => unreadable("\"name\" is not text".into()),
        },
        Ok(_) => unreadable("the file is not a JSON object".into()),
        Err(e) => unreadable(e.to_string()),
    }
}

/// Writes through a temporary file so a failed write leaves the previous file whole.
fn write(path: &Path, raw: &Map<String, Value>) -> AppResult<()> {
    let tmp = path.with_file_name(format!("{FILE_NAME}.tmp"));
    std::fs::write(&tmp, serde_json::to_string_pretty(raw)?)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_means_no_name_and_is_not_created() {
        let dir = tempfile::tempdir().unwrap();
        let store = ProfileStore::open(dir.path());
        assert_eq!(store.current(), UserProfile { name: None, unreadable: None });
        assert!(!dir.path().join(FILE_NAME).exists());
    }

    #[test]
    fn a_saved_name_is_trimmed_and_kept_across_reopening() {
        let dir = tempfile::tempdir().unwrap();
        ProfileStore::open(dir.path()).save_name("  Ana Pérez ").unwrap();
        let reopened = ProfileStore::open(dir.path());
        assert_eq!(reopened.current().name.as_deref(), Some("Ana Pérez"));
    }

    #[test]
    fn saving_an_empty_name_clears_it_and_keeps_other_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        std::fs::write(&path, r#"{ "name": "Ana", "works_on": "late blight" }"#).unwrap();
        let store = ProfileStore::open(dir.path());
        assert_eq!(store.save_name(" ").unwrap().name, None);
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved, serde_json::json!({ "works_on": "late blight" }));
    }

    #[test]
    fn a_name_over_100_characters_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let store = ProfileStore::open(dir.path());
        store.save_name("Ana").unwrap();
        let error = store.save_name(&"a".repeat(101)).unwrap_err();
        assert_eq!(error.code, "invalid_input");
        assert_eq!(store.current().name.as_deref(), Some("Ana"));
    }

    #[test]
    fn an_unreadable_file_refuses_saves_and_stays_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(FILE_NAME);
        std::fs::write(&path, "{ not json").unwrap();
        let store = ProfileStore::open(dir.path());
        let profile = store.current();
        assert_eq!(profile.name, None);
        assert!(profile.unreadable.is_some());
        assert!(store.save_name("Ana").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ not json");
    }
}
