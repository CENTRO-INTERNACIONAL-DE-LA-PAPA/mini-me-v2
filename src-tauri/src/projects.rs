//! The Mini-Me Data folder and Project folders: creating, listing and opening Projects.

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use uuid::Uuid;

use crate::conversations;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::paths::ProjectPaths;
use crate::protocol::{Origin, new_id, now_ms};
use crate::store::Project;

pub const DATA_FOLDER_NAME: &str = "Mini-Me Data";
/// Mini-Me Dev's Projects folder, kept apart from Mini-Me's.
const DEV_DATA_FOLDER_NAME: &str = "Mini-Me Data (Dev)";
const MAX_NAME_CHARS: usize = 100;
/// How long a read-only read waits while the Project's own connection is writing.
const READ_BUSY_TIMEOUT: Duration = Duration::from_millis(500);
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub created_at: i64,
    #[serde(skip)]
    pub folder: PathBuf,
}

/// Whether `identifier` is Mini-Me Dev's, the development app kept apart from Mini-Me.
pub fn is_mini_me_dev(identifier: &str) -> bool {
    identifier.ends_with(".dev")
}

/// The Projects folder's name for the app with this identifier.
pub fn data_folder_name(identifier: &str) -> &'static str {
    if is_mini_me_dev(identifier) {
        DEV_DATA_FOLDER_NAME
    } else {
        DATA_FOLDER_NAME
    }
}

/// Creates `<documents>/<folder>` if needed and returns it.
pub fn ensure_data_root(documents: &Path, folder: &str) -> AppResult<PathBuf> {
    let root = documents.join(folder);
    std::fs::create_dir_all(&root)?;
    Ok(root)
}

pub fn validate_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    let length = trimmed.chars().count();
    if length == 0 {
        return Err(AppError::new("invalid_name", "The Project name cannot be empty."));
    }
    if length > MAX_NAME_CHARS {
        return Err(AppError::new(
            "invalid_name",
            format!("The Project name must be at most {MAX_NAME_CHARS} characters."),
        ));
    }
    Ok(trimmed.to_string())
}

/// Turns a Project name into a folder name that is valid on Windows, macOS and Linux.
pub fn folder_name(name: &str) -> String {
    let replaced: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let mut folder = replaced.trim().trim_end_matches(['.', ' ']).to_string();
    if folder.is_empty() {
        folder = "Project".to_string();
    }
    let stem = folder.split('.').next().unwrap_or_default().to_ascii_uppercase();
    if WINDOWS_RESERVED.contains(&stem.as_str()) {
        folder.push('_');
    }
    folder
}

/// Picks a folder inside `data_root` that does not exist yet, adding " (2)", " (3)"… on
/// collision.
fn unique_folder(data_root: &Path, base: &str) -> PathBuf {
    let mut candidate = data_root.join(base);
    let mut counter = 2;
    while candidate.exists() {
        candidate = data_root.join(format!("{base} ({counter})"));
        counter += 1;
    }
    candidate
}

pub fn create(data_root: &Path, name: &str) -> AppResult<ProjectSummary> {
    let name = validate_name(name)?;
    let folder = unique_folder(data_root, &folder_name(&name));
    std::fs::create_dir(&folder)?;
    std::fs::create_dir(folder.join("assets"))?;

    let summary = ProjectSummary {
        id: new_id(),
        name,
        created_at: now_ms(),
        folder: folder.clone(),
    };
    let conn = db::open(&folder.join("project.sqlite"))?;
    conn.execute(
        "INSERT INTO project (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![summary.id.to_string(), summary.name, summary.created_at],
    )?;
    Ok(summary)
}

/// Reads a folder's Project metadata without migrating or writing anything.
fn read_summary(folder: &Path) -> Option<ProjectSummary> {
    let database = folder.join("project.sqlite");
    if !database.is_file() {
        return None;
    }
    let conn = db::open_read_only(&database).ok()?;
    let (id, name, created_at): (String, String, i64) = conn
        .query_row("SELECT id, name, created_at FROM project LIMIT 1", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .optional()
        .ok()??;
    Some(ProjectSummary {
        id: Uuid::parse_str(&id).ok()?,
        name,
        created_at,
        folder: folder.to_path_buf(),
    })
}

/// Lists Projects in `data_root`, most recently opened first, then newest first. Folders
/// without a readable `project.sqlite` are ignored.
pub fn list(
    data_root: &Path,
    recent: &std::collections::HashMap<Uuid, i64>,
) -> AppResult<Vec<ProjectSummary>> {
    let mut projects = Vec::new();
    for entry in std::fs::read_dir(data_root)? {
        let path = entry?.path();
        if path.is_dir() {
            if let Some(summary) = read_summary(&path) {
                projects.push(summary);
            }
        }
    }
    projects.sort_by_key(|p| {
        std::cmp::Reverse((recent.get(&p.id).copied().unwrap_or(0), p.created_at))
    });
    Ok(projects)
}

/// Reads every Project in `data_root` with `read`, merging what it returns. Each database is
/// opened read-only, so nothing is migrated or written; a Project that cannot be read, or
/// whose schema is newer than this app's, is left out.
pub fn read_each<T>(
    data_root: &Path,
    read: impl Fn(&ProjectSummary, &Connection) -> AppResult<Vec<T>>,
) -> AppResult<Vec<T>> {
    let read_one = |project: &ProjectSummary| -> AppResult<Vec<T>> {
        let conn = db::open_read_only(&project.folder.join("project.sqlite"))?;
        conn.busy_timeout(READ_BUSY_TIMEOUT)?;
        if db::is_newer(&conn)? {
            return Ok(Vec::new());
        }
        read(project, &conn)
    };
    Ok(list(data_root, &Default::default())?
        .iter()
        .filter_map(|project| read_one(project).ok())
        .flatten()
        .collect())
}

/// Opens a Project for use: migrates its database and marks interrupted replies as failed.
pub fn open(summary: &ProjectSummary, origin: Origin) -> AppResult<Project> {
    let paths = ProjectPaths::new(&summary.folder)?;
    let conn = db::open(&paths.database())?;
    let project = Project::new(summary.id, summary.name.clone(), paths, conn, origin);
    conversations::recover_interrupted(&project)?;
    Ok(project)
}

#[cfg(test)]
pub mod test_support {
    use super::*;

    pub fn origin() -> Origin {
        Origin {
            installation_id: new_id(),
            user_id: new_id(),
        }
    }

    /// A freshly created and opened Project inside a temporary Mini-Me Data folder.
    pub fn temp_project() -> (tempfile::TempDir, Project) {
        let dir = tempfile::tempdir().unwrap();
        let root = ensure_data_root(dir.path(), DATA_FOLDER_NAME).unwrap();
        let summary = create(&root, "Test Project").unwrap();
        let project = open(&summary, origin()).unwrap();
        (dir, project)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn mini_me_dev_keeps_its_projects_in_its_own_folder() {
        assert_eq!(data_folder_name("org.cipotato.mini-me"), "Mini-Me Data");
        assert_eq!(data_folder_name("org.cipotato.mini-me.dev"), "Mini-Me Data (Dev)");
    }

    #[test]
    fn rejects_invalid_names() {
        assert_eq!(validate_name("").unwrap_err().code, "invalid_name");
        assert_eq!(validate_name("   ").unwrap_err().code, "invalid_name");
        assert_eq!(validate_name(&"a".repeat(101)).unwrap_err().code, "invalid_name");
        assert_eq!(validate_name(&"a".repeat(100)).unwrap(), "a".repeat(100));
        assert_eq!(validate_name("  Trials  ").unwrap(), "Trials");
    }

    #[test]
    fn folder_names_are_safe() {
        let folder = folder_name("Trials: 2026/27");
        assert!(!folder.contains(':') && !folder.contains('/'));
        assert_eq!(folder_name("CON"), "CON_");
        assert_eq!(folder_name("nul.txt"), "nul.txt_");
        assert_eq!(folder_name("Trailing. "), "Trailing");
        assert_eq!(folder_name("???"), "---");
    }

    #[test]
    fn creates_project_folder_and_lists_it() {
        let dir = tempfile::tempdir().unwrap();
        let root = ensure_data_root(dir.path(), DATA_FOLDER_NAME).unwrap();
        let summary = create(&root, "Late Blight Resistance").unwrap();
        assert!(summary.folder.join("project.sqlite").is_file());
        assert!(summary.folder.join("assets").is_dir());

        let listed = list(&root, &HashMap::new()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Late Blight Resistance");
    }

    #[test]
    fn same_name_gets_separate_folders() {
        let dir = tempfile::tempdir().unwrap();
        let root = ensure_data_root(dir.path(), DATA_FOLDER_NAME).unwrap();
        let first = create(&root, "Trials").unwrap();
        let second = create(&root, "Trials").unwrap();
        assert_ne!(first.folder, second.folder);
        assert_eq!(list(&root, &HashMap::new()).unwrap().len(), 2);
    }

    #[test]
    fn unrelated_folders_are_ignored_and_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let root = ensure_data_root(dir.path(), DATA_FOLDER_NAME).unwrap();
        let unrelated = root.join("My notes");
        std::fs::create_dir(&unrelated).unwrap();
        std::fs::write(unrelated.join("notes.txt"), "hello").unwrap();

        assert!(list(&root, &HashMap::new()).unwrap().is_empty());
        assert_eq!(std::fs::read_dir(&unrelated).unwrap().count(), 1);
    }

    #[test]
    fn recently_opened_projects_come_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = ensure_data_root(dir.path(), DATA_FOLDER_NAME).unwrap();
        let older = create(&root, "Older").unwrap();
        let _newer = create(&root, "Newer").unwrap();
        let recent = HashMap::from([(older.id, now_ms())]);
        assert_eq!(list(&root, &recent).unwrap()[0].name, "Older");
    }
}
