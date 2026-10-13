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
    let media_type = mime_guess::from_path(&name)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    let asset = AssetRef {
        id,
        name,
        media_type,
        size_bytes,
    };
    project.lock().conn.execute(
        "INSERT INTO assets (id, name, media_type, size_bytes, source, rel_path, created_at) \
         VALUES (?1, ?2, ?3, ?4, 'upload', ?5, ?6)",
        params![
            asset.id.to_string(),
            asset.name,
            asset.media_type,
            asset.size_bytes,
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
}
