//! The per-Project Asset registry. Asset files live in `assets/<asset-id>/<file name>`.

use std::path::{Path, PathBuf};

use rusqlite::{OptionalExtension, params};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::protocol::{AssetRef, new_id, now_ms};
use crate::store::{Project, ProjectState};

/// Copies a file the user picked into the Project and registers it. The original file is
/// only read.
pub fn import(project: &Project, source: &Path) -> AppResult<AssetRef> {
    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| AppError::invalid_input("The selected item is not a file."))?;
    if !source.is_file() {
        return Err(AppError::invalid_input("The selected item is not a file."));
    }

    let id = new_id();
    let rel_path = format!("assets/{id}/{name}");
    let destination = project.paths.resolve(&rel_path)?;
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let size_bytes = std::fs::copy(source, &destination)? as i64;
    let media_type = media_type_of(&name);
    register(project, AssetRef { id, name, media_type, size_bytes }, "upload", &rel_path)
}

/// Characters Windows does not allow in file names, besides the path separators.
const FORBIDDEN_IN_NAMES: &[char] = &['<', '>', ':', '"', '|', '?', '*'];

/// Names Windows reserves for devices, with or without an extension (`NUL`, `nul.txt`).
const WINDOWS_DEVICES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Refuses a name for a generated Asset that is empty, longer than 255 characters, or could
/// leave its folder or fail on Windows: `.` or `..`, path separators, control characters, the
/// characters Windows forbids, a Windows device name, and a trailing dot or space.
pub fn check_name(name: &str) -> AppResult<()> {
    let stem = name.split('.').next().unwrap_or_default().trim_end();
    let invalid = name.is_empty()
        || name.chars().count() > 255
        || name == "."
        || name == ".."
        || name.contains(['/', '\\'])
        || name.contains(FORBIDDEN_IN_NAMES)
        || name.chars().any(char::is_control)
        || name.ends_with(['.', ' '])
        || WINDOWS_DEVICES.iter().any(|device| stem.eq_ignore_ascii_case(device));
    if invalid {
        return Err(AppError::invalid_input(format!(
            "\"{name}\" cannot be used as a file name in a Project."
        )));
    }
    Ok(())
}

/// Stores a file a Trait produced in the Project as a `generated` Asset. `media_type` falls
/// back to one guessed from the name when empty.
pub fn write_generated(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
) -> AppResult<AssetRef> {
    check_name(name)?;
    let id = new_id();
    let rel_path = format!("assets/{id}/{name}");
    let destination = project.paths.resolve(&rel_path)?;
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&destination, bytes)?;
    let media_type = if media_type.trim().is_empty() {
        media_type_of(name)
    } else {
        media_type.trim().to_string()
    };
    let asset = AssetRef { id, name: name.to_string(), media_type, size_bytes: bytes.len() as i64 };
    register(project, asset, "generated", &rel_path).inspect_err(|_| {
        let _ = remove_files(project, id);
    })
}

/// Removes a generated Asset that could not be attached to its reply, with its folder.
pub fn remove(project: &Project, id: Uuid) -> AppResult<()> {
    project.lock().conn.execute("DELETE FROM assets WHERE id = ?1", params![id.to_string()])?;
    remove_files(project, id)
}

fn remove_files(project: &Project, id: Uuid) -> AppResult<()> {
    let folder = project.paths.resolve(&format!("assets/{id}"))?;
    if folder.exists() {
        std::fs::remove_dir_all(folder)?;
    }
    Ok(())
}

fn media_type_of(name: &str) -> String {
    mime_guess::from_path(name).first_or_octet_stream().essence_str().to_string()
}

/// Adds a stored file to the registry; `source` is `upload` or `generated`.
fn register(
    project: &Project,
    asset: AssetRef,
    source: &str,
    rel_path: &str,
) -> AppResult<AssetRef> {
    project.lock().conn.execute(
        "INSERT INTO assets (id, name, media_type, size_bytes, source, rel_path, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            asset.id.to_string(),
            asset.name,
            asset.media_type,
            asset.size_bytes,
            source,
            rel_path,
            now_ms()
        ],
    )?;
    Ok(asset)
}

/// Looks up an Asset by ID, failing with `not_found` if it is not in this Project.
pub fn find(state: &ProjectState, id: Uuid) -> AppResult<AssetRef> {
    state
        .conn
        .query_row(
            "SELECT name, media_type, size_bytes FROM assets WHERE id = ?1",
            params![id.to_string()],
            |row| {
                Ok(AssetRef {
                    id,
                    name: row.get(0)?,
                    media_type: row.get(1)?,
                    size_bytes: row.get(2)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::not_found("That file is not part of this Project."))
}

/// Assets whose name contains `query` (case-insensitive), newest first.
pub fn list(project: &Project, query: Option<&str>) -> AppResult<Vec<AssetRef>> {
    let state = project.lock();
    let mut stmt = state.conn.prepare(
        "SELECT id, name, media_type, size_bytes FROM assets ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    let needle = query.map(|q| q.trim().to_lowercase()).unwrap_or_default();
    let mut assets = Vec::new();
    for row in rows {
        let (id, name, media_type, size_bytes) = row?;
        if !needle.is_empty() && !name.to_lowercase().contains(&needle) {
            continue;
        }
        assets.push(AssetRef {
            id: Uuid::parse_str(&id).map_err(|_| AppError::storage("stored ID is not readable"))?,
            name,
            media_type,
            size_bytes,
        });
    }
    Ok(assets)
}

/// The file behind an Asset, checked against Project-folder confinement.
pub fn file_path(project: &Project, id: Uuid) -> AppResult<PathBuf> {
    let rel_path: String = project
        .lock()
        .conn
        .query_row(
            "SELECT rel_path FROM assets WHERE id = ?1",
            params![id.to_string()],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| AppError::not_found("That file is not part of this Project."))?;
    let path = project.paths.resolve(&rel_path)?;
    if !path.is_file() {
        return Err(AppError::new(
            "asset_missing",
            "This file is no longer in the Project folder.",
        ));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::temp_project;

    #[test]
    fn import_copies_and_registers() {
        let (dir, project) = temp_project();
        let source = dir.path().join("field-trial.csv");
        std::fs::write(&source, "plot,yield\n1,20\n").unwrap();

        let asset = import(&project, &source).unwrap();
        assert_eq!(asset.name, "field-trial.csv");
        assert_eq!(asset.media_type, "text/csv");
        assert_eq!(asset.size_bytes, 16);

        let stored = file_path(&project, asset.id).unwrap();
        assert!(stored.starts_with(project.paths.root().join("assets")));
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "plot,yield\n1,20\n");
        assert_eq!(find(&project.lock(), asset.id).unwrap(), asset);
    }

    #[test]
    fn same_file_name_does_not_overwrite() {
        let (dir, project) = temp_project();
        let first_dir = dir.path().join("a");
        let second_dir = dir.path().join("b");
        std::fs::create_dir(&first_dir).unwrap();
        std::fs::create_dir(&second_dir).unwrap();
        std::fs::write(first_dir.join("data.csv"), "first").unwrap();
        std::fs::write(second_dir.join("data.csv"), "second").unwrap();

        let first = import(&project, &first_dir.join("data.csv")).unwrap();
        let second = import(&project, &second_dir.join("data.csv")).unwrap();
        assert_ne!(first.id, second.id);
        let read = |id| std::fs::read_to_string(file_path(&project, id).unwrap()).unwrap();
        assert_eq!(read(first.id), "first");
        assert_eq!(read(second.id), "second");
    }

    #[test]
    fn list_filters_by_name() {
        let (dir, project) = temp_project();
        for name in ["field-trial.csv", "notes.md", "Trial-2.xlsx"] {
            let source = dir.path().join(name);
            std::fs::write(&source, "x").unwrap();
            import(&project, &source).unwrap();
        }
        let names: Vec<String> = list(&project, Some("trial"))
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(names.len(), 2);
        assert!(names.iter().all(|n| n.to_lowercase().contains("trial")));
    }

    #[test]
    fn unknown_asset_is_not_found() {
        let (_dir, project) = temp_project();
        assert_eq!(find(&project.lock(), new_id()).unwrap_err().code, "not_found");
    }

    fn assets_folder_entries(project: &Project) -> usize {
        let folder = project.paths.root().join("assets");
        std::fs::read_dir(folder).map(|entries| entries.count()).unwrap_or(0)
    }

    #[test]
    fn a_generated_file_is_stored_in_its_own_folder_and_registered() {
        let (_dir, project) = temp_project();
        let asset =
            write_generated(&project, "theory-store.json", "application/json", b"{}").unwrap();
        assert_eq!(asset.size_bytes, 2);
        let stored = file_path(&project, asset.id).unwrap();
        let expected = format!("assets/{}/theory-store.json", asset.id);
        assert_eq!(stored, project.paths.root().join(expected));
        assert_eq!(std::fs::read(stored).unwrap(), b"{}");
        let id = asset.id.to_string();
        let source: String = project
            .lock()
            .conn
            .query_row("SELECT source FROM assets WHERE id = ?1", params![id], |r| r.get(0))
            .unwrap();
        assert_eq!(source, "generated");
    }

    #[test]
    fn names_that_could_leave_the_folder_or_fail_on_windows_are_refused() {
        let (_dir, project) = temp_project();
        let long = "a".repeat(256);
        let names = [
            "", "../../notes.txt", "a/b.txt", "a\\b.txt", "..", ".", "notes?.txt", "notes.", "NUL",
            "nul.txt", "Com1.json", "con .txt", &long,
        ];
        for name in names {
            let err = write_generated(&project, name, "text/plain", b"x").unwrap_err();
            assert_eq!(err.code, "invalid_input", "{name}");
        }
        assert_eq!(assets_folder_entries(&project), 0);
        assert!(list(&project, None).unwrap().is_empty());
    }

    #[test]
    fn names_with_dots_or_device_words_inside_are_allowed() {
        for name in ["results..final.csv", "a...b.json", "console.txt", "nullable.md", ".env"] {
            assert!(check_name(name).is_ok(), "{name}");
        }
    }

    #[test]
    fn generated_files_with_the_same_name_are_both_kept() {
        let (_dir, project) = temp_project();
        let first = write_generated(&project, "theory-store.json", "", b"first").unwrap();
        let second = write_generated(&project, "theory-store.json", "", b"second").unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(first.media_type, "application/json");
        let read = |id| std::fs::read(file_path(&project, id).unwrap()).unwrap();
        assert_eq!(read(first.id), b"first");
        assert_eq!(read(second.id), b"second");
    }

    #[test]
    fn a_removed_asset_leaves_no_file_or_entry() {
        let (_dir, project) = temp_project();
        let asset = write_generated(&project, "notes.txt", "text/plain", b"x").unwrap();
        remove(&project, asset.id).unwrap();
        assert_eq!(find(&project.lock(), asset.id).unwrap_err().code, "not_found");
        assert_eq!(assets_folder_entries(&project), 0);
    }
}
