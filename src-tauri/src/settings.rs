//! App settings stored in the OS app-config directory, outside Mini-Me Data, so Project
//! folders stay self-contained.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;
use crate::protocol::{Origin, new_id};

const FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    pub installation_id: Uuid,
    pub user_id: Uuid,
    /// Project ID → last time it was opened (Unix ms).
    #[serde(default)]
    pub recent_projects: HashMap<Uuid, i64>,
}

impl Settings {
    /// Loads the settings from `config_dir`, creating them with fresh IDs on first launch.
    pub fn load_or_create(config_dir: &Path) -> AppResult<Self> {
        let path = config_dir.join(FILE_NAME);
        if path.exists() {
            let raw = std::fs::read_to_string(&path)?;
            return Ok(serde_json::from_str(&raw)?);
        }
        let settings = Settings {
            installation_id: new_id(),
            user_id: new_id(),
            recent_projects: HashMap::new(),
        };
        settings.save(config_dir)?;
        Ok(settings)
    }

    /// Writes to a temporary file and renames it, so a crash never leaves a half-written file.
    pub fn save(&self, config_dir: &Path) -> AppResult<()> {
        std::fs::create_dir_all(config_dir)?;
        let tmp: PathBuf = config_dir.join(format!("{FILE_NAME}.tmp"));
        std::fs::write(&tmp, serde_json::to_string_pretty(self)?)?;
        std::fs::rename(&tmp, config_dir.join(FILE_NAME))?;
        Ok(())
    }

    pub fn origin(&self) -> Origin {
        Origin {
            installation_id: self.installation_id,
            user_id: self.user_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_stable_across_loads() {
        let dir = tempfile::tempdir().unwrap();
        let first = Settings::load_or_create(dir.path()).unwrap();
        let second = Settings::load_or_create(dir.path()).unwrap();
        assert_eq!(first.installation_id, second.installation_id);
        assert_eq!(first.user_id, second.user_id);
    }

    #[test]
    fn recent_projects_persist() {
        let dir = tempfile::tempdir().unwrap();
        let mut settings = Settings::load_or_create(dir.path()).unwrap();
        let project = new_id();
        settings.recent_projects.insert(project, 42);
        settings.save(dir.path()).unwrap();
        let loaded = Settings::load_or_create(dir.path()).unwrap();
        assert_eq!(loaded.recent_projects.get(&project), Some(&42));
    }
}
