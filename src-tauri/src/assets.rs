//! The per-Project Asset registry. Asset files live in `assets/<asset-id>/<file name>`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::comments;
use crate::conversations;
use crate::error::{AppError, AppResult};
use crate::protocol::{
    AssetRef, Author, AuthorKind, TextComponent, TextComponentKind, new_id, now_ms,
};
use crate::store::{Project, ProjectState, parse_id};

/// Where an Asset downloaded from outside the Project came from.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AssetOrigin {
    /// A Dataverse file: its file ID there, and its dataset's persistent ID, title and web address.
    Dataverse { file_id: u64, dataset_id: String, title: String, url: String },
}

/// Copies a file the user picked into the Project; the original is only read.
pub fn import(project: &Project, source: &Path, user: &Author) -> AppResult<AssetRef> {
    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| AppError::invalid_input("The selected item is not a file."))?;
    copy_in(project, source, &name, ("upload", user), None)
}

/// Copies a downloaded file into the Project as `name` and records where it came from.
pub fn import_downloaded(
    project: &Project,
    source: &Path,
    name: &str,
    user: &Author,
    origin: &AssetOrigin,
) -> AppResult<AssetRef> {
    check_name(name)?;
    let kind = match origin {
        AssetOrigin::Dataverse { .. } => "dataverse",
    };
    copy_in(project, source, name, (kind, user), Some(origin))
}

/// Assets downloaded from CIP's Dataverse, keyed by their file ID there.
pub fn dataverse_files(state: &ProjectState) -> AppResult<HashMap<u64, AssetRef>> {
    let mut stmt = state.conn.prepare(
        "SELECT id, name, media_type, size_bytes, origin FROM assets \
         WHERE source = 'dataverse' AND origin IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        Ok((id, row.get(1)?, row.get(2)?, row.get(3)?, row.get::<_, String>(4)?))
    })?;
    let mut found = HashMap::new();
    for row in rows {
        let (id, name, media_type, size_bytes, origin) = row?;
        let (Ok(id), Ok(AssetOrigin::Dataverse { file_id, .. })) =
            (Uuid::parse_str(&id), serde_json::from_str(&origin))
        else {
            continue;
        };
        found.insert(file_id, AssetRef { id, name, media_type, size_bytes });
    }
    Ok(found)
}

/// Copies the file at `source` into a new folder under `assets` as `name`, and registers it.
fn copy_in(
    project: &Project,
    source: &Path,
    name: &str,
    (kind, author): (&str, &Author),
    origin: Option<&AssetOrigin>,
) -> AppResult<AssetRef> {
    if !source.is_file() {
        return Err(AppError::invalid_input("The selected item is not a file."));
    }
    let name = name.to_string();
    let id = new_id();
    let rel_path = format!("assets/{id}/{name}");
    let destination = project.paths.resolve(&rel_path)?;
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let size_bytes = std::fs::copy(source, &destination)? as i64;
    let media_type = media_type_of(&name);
    let asset = AssetRef { id, name, media_type, size_bytes };
    register(project, asset, (kind, author), &rel_path, origin).inspect_err(|_| {
        let _ = remove_files(project, id);
    })
}

/// Skips folders. Every path must be one of `dropped`, the paths the OS reported for the latest
/// drop, so the UI cannot name a file of its own.
pub fn import_dropped(
    project: &Project,
    paths: &[PathBuf],
    dropped: &[PathBuf],
    user: &Author,
) -> AppResult<Vec<AssetRef>> {
    if let Some(path) = paths.iter().find(|path| !dropped.contains(path)) {
        return Err(AppError::invalid_input(format!(
            "{} was not dropped on Mini-Me.",
            path.display()
        )));
    }
    paths.iter().filter(|path| path.is_file()).map(|path| import(project, path, user)).collect()
}

/// Media types every webview the app runs in can draw as an image.
pub const THUMBNAIL_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/// An image Asset's media type and bytes, for its thumbnail; other media types are refused.
pub fn read_image(project: &Project, id: Uuid) -> AppResult<(String, Vec<u8>)> {
    let asset = find(&project.lock(), id)?;
    if !THUMBNAIL_TYPES.contains(&asset.media_type.as_str()) {
        return Err(AppError::invalid_input(format!("{} is not an image.", asset.name)));
    }
    Ok((asset.media_type, std::fs::read(file_path(project, id)?)?))
}

/// Characters Windows does not allow in file names, besides the path separators.
const FORBIDDEN_IN_NAMES: &[char] = &['<', '>', ':', '"', '|', '?', '*'];

/// Names Windows reserves for devices, with or without an extension (`NUL`, `nul.txt`).
const WINDOWS_DEVICES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Refuses an Asset name that is empty, over 255 characters, or could leave its folder or fail on
/// Windows.
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

/// Stores a file the app made, such as a Trait's output, as a `generated` Asset. An empty
/// `media_type` is guessed from the name.
pub fn write_generated(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
    author: &Author,
) -> AppResult<AssetRef> {
    store(project, name, media_type, bytes, ("generated", author))
}

/// Stores bytes the user pasted or started, such as a blank document, as an `upload` Asset.
pub fn import_bytes(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
    user: &Author,
) -> AppResult<AssetRef> {
    store(project, name, media_type, bytes, ("upload", user))
}

/// The title made safe plus `.csv`, or `Table.csv` without one. A title that is a table file's name
/// loses its extension, so `trial.csv` is not saved as `trial.csv.csv`.
pub fn table_file_name(title: &str) -> String {
    let title = title.trim();
    let lower = title.to_lowercase();
    let title = [".csv", ".tsv", ".xlsx", ".xls"]
        .iter()
        .find(|extension| lower.ends_with(*extension) && lower.len() > extension.len())
        .map_or(title, |extension| &title[..title.len() - extension.len()]);
    let stem = if title.is_empty() {
        "Table".to_string()
    } else {
        crate::projects::folder_name(title)
    };
    format!("{stem}.csv")
}

/// The clipboard's file name when usable, else `Pasted image` with `media_type`'s usual extension.
pub fn pasted_name(clipboard_name: &str, media_type: &str) -> String {
    let clipboard_name = clipboard_name.trim();
    if !clipboard_name.is_empty() && check_name(clipboard_name).is_ok() {
        return clipboard_name.to_string();
    }
    let extension = match media_type {
        "image/jpeg" => Some("jpg"),
        other => mime_guess::get_mime_extensions_str(other).and_then(|e| e.first().copied()),
    };
    match extension {
        Some(extension) => format!("Pasted image.{extension}"),
        None => "Pasted image".to_string(),
    }
}

/// Writes `bytes` to a new folder under `assets` and registers them. An empty `media_type` is
/// guessed from the name.
fn store(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
    (source, author): (&str, &Author),
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
    register(project, asset, (source, author), &rel_path, None).inspect_err(|_| {
        let _ = remove_files(project, id);
    })
}

/// The new name for `current`: its extension stays, whether or not `typed` repeats it.
fn renamed(current: &str, typed: &str) -> String {
    let typed = typed.trim();
    let Some(extension) = Path::new(current).extension().and_then(|e| e.to_str()) else {
        return typed.to_string();
    };
    let dotted = format!(".{extension}");
    let repeats = typed
        .len()
        .checked_sub(dotted.len())
        .and_then(|from| typed.get(from..))
        .is_some_and(|tail| tail.eq_ignore_ascii_case(&dotted));
    let stem = if repeats { &typed[..typed.len() - dotted.len()] } else { typed };
    format!("{stem}{dotted}")
}

/// Keeps the extension and the ID, so references to the file keep working.
pub fn rename(project: &Project, id: Uuid, typed: &str) -> AppResult<AssetRef> {
    let current = find(&project.lock(), id)?;
    let name = renamed(&current.name, typed);
    // Nothing typed, or only the extension, would leave a hidden file with no name.
    if typed.trim().is_empty() || (name.starts_with('.') && !current.name.starts_with('.')) {
        return Err(AppError::invalid_input("A file needs a name."));
    }
    if name == current.name {
        return Ok(current);
    }
    check_name(&name)?;
    let from = file_path(project, id)?;
    let rel_path = format!("assets/{id}/{name}");
    let to = project.paths.resolve(&rel_path)?;
    std::fs::rename(&from, &to)?;
    let updated = project.lock().conn.execute(
        "UPDATE assets SET name = ?1, rel_path = ?2 WHERE id = ?3",
        params![name, rel_path, id.to_string()],
    );
    if let Err(error) = updated {
        let _ = std::fs::rename(&to, &from);
        return Err(error.into());
    }
    Ok(AssetRef { name, ..current })
}

/// The first of "<stem> copy", "<stem> copy 2", ... not in `taken`, with `extension`. A stem that
/// already ends in " copy" or " copy N" is not extended again.
fn copy_name(stem: &str, extension: Option<&str>, taken: &[String]) -> String {
    let base = match stem.rsplit_once(" copy") {
        Some((base, rest)) if rest.is_empty() || rest.trim().parse::<u32>().is_ok() => base,
        _ => stem,
    };
    let with_extension = |label: String| match extension {
        Some(extension) => format!("{label}.{extension}"),
        None => label,
    };
    (1..)
        .map(|n| match n {
            1 => with_extension(format!("{base} copy")),
            _ => with_extension(format!("{base} copy {n}")),
        })
        .find(|name| !taken.contains(name))
        .expect("an unbounded range always yields a free name")
}

/// Adds "<name> copy", numbered when taken. Only the bytes are copied: a document's comment threads
/// stay with the original.
pub fn duplicate(project: &Project, id: Uuid, user: &Author) -> AppResult<AssetRef> {
    let asset = find(&project.lock(), id)?;
    let bytes = std::fs::read(file_path(project, id)?)?;
    let path = Path::new(&asset.name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&asset.name);
    let taken: Vec<String> = list(project, None)?.into_iter().map(|a| a.name).collect();
    let name = copy_name(stem, path.extension().and_then(|e| e.to_str()), &taken);
    import_bytes(project, &name, &asset.media_type, &bytes, user)
}

/// Deletes the file with its folder, and a document's comment threads.
pub fn delete(project: &Project, id: Uuid) -> AppResult<()> {
    let threads: Vec<String> = {
        let state = project.lock();
        let mut stmt = state
            .conn
            .prepare("SELECT conversation_id FROM comment_threads WHERE asset_id = ?1")?;
        let rows = stmt.query_map(params![id.to_string()], |row| row.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    for thread in threads {
        let thread = Uuid::parse_str(&thread).map_err(|_| AppError::storage("bad thread ID"))?;
        conversations::delete(project, thread)?;
    }
    remove(project, id)
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

/// Adds a stored file to the registry; `source` is `upload`, `generated` or `dataverse`.
fn register(
    project: &Project,
    asset: AssetRef,
    (source, author): (&str, &Author),
    rel_path: &str,
    origin: Option<&AssetOrigin>,
) -> AppResult<AssetRef> {
    let origin = origin.map(serde_json::to_string).transpose()?;
    project.lock().conn.execute(
        "INSERT INTO assets (id, name, media_type, size_bytes, source, rel_path, created_at, \
         added_by_kind, added_by_id, origin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            asset.id.to_string(),
            asset.name,
            asset.media_type,
            asset.size_bytes,
            source,
            rel_path,
            now_ms(),
            author.kind.as_str(),
            author.id,
            origin
        ],
    )?;
    Ok(asset)
}

/// Fails with `not_found` if the Asset is not in this Project.
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
            id: parse_id(&id, "ID")?,
            name,
            media_type,
            size_bytes,
        });
    }
    Ok(assets)
}

/// An Asset as the Project's Files screen lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileEntry {
    #[serde(flatten)]
    pub asset: AssetRef,
    /// `upload` (imported or started by the user), `generated` (made by the app, such as a
    /// Mini-Me's output or an exported PDF) or `dataverse`.
    pub source: String,
    /// Where a downloaded file came from.
    pub origin: Option<AssetOrigin>,
    /// When the Asset was registered, in milliseconds since the epoch.
    pub created_at: i64,
    /// When its file last changed, in milliseconds since the epoch; none when the file is missing.
    pub modified_at: Option<i64>,
    /// None for a file whose author was never recorded.
    pub added_by: Option<Author>,
    /// Conversations whose messages attach or reference the Asset, in order of first appearance.
    pub used_in: Vec<ConversationRef>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConversationRef {
    pub id: Uuid,
    pub title: String,
}

/// Every Asset of the Project, newest first, with who added it and where it is used.
pub fn project_files(project: &Project) -> AppResult<Vec<FileEntry>> {
    let state = project.lock();
    let mut entries = Vec::new();
    {
        let mut stmt = state.conn.prepare(
            "SELECT id, name, media_type, size_bytes, source, created_at, rel_path, \
             added_by_kind, added_by_id, origin FROM assets ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
            ), row.get::<_, Option<String>>(9)?))
        })?;
        for row in rows {
            let (columns, origin) = row?;
            let (id, name, media_type, size_bytes, source, created_at, rel_path, by_kind, by_id) =
                columns;
            let added_by = author(by_kind, by_id);
            let modified_at = project
                .paths
                .resolve(&rel_path)
                .ok()
                .and_then(|path| std::fs::metadata(path).ok()?.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|since| since.as_millis() as i64);
            entries.push(FileEntry {
                asset: AssetRef {
                    id: parse_id(&id, "ID")?,
                    name,
                    media_type,
                    size_bytes,
                },
                source,
                origin: origin.and_then(|o| serde_json::from_str(&o).ok()),
                created_at,
                modified_at,
                added_by,
                used_in: Vec::new(),
            });
        }
    }
    let index: HashMap<Uuid, usize> =
        entries.iter().enumerate().map(|(i, e)| (e.asset.id, i)).collect();

    let mut stmt = state.conn.prepare(&format!(
        "SELECT m.conversation_id, c.title, m.attachments, m.text_components FROM messages m \
         JOIN conversations c ON c.id = m.conversation_id WHERE {} ORDER BY m.rowid",
        comments::not_a_thread("c.id")
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    for row in rows {
        let (conversation, title, attachments, text_components) = row?;
        let conversation = parse_id(&conversation, "ID")?;
        let attached: Vec<AssetRef> = serde_json::from_str(&attachments)?;
        let referenced: Vec<TextComponent> = serde_json::from_str(&text_components)?;
        let ids = attached.iter().map(|a| a.id).chain(
            referenced.iter().filter(|t| t.kind == TextComponentKind::Asset).map(|t| t.id),
        );
        for id in ids {
            let Some(entry) = index.get(&id).map(|&i| &mut entries[i]) else {
                continue;
            };
            if !entry.used_in.iter().any(|c| c.id == conversation) {
                entry.used_in.push(ConversationRef { id: conversation, title: title.clone() });
            }
        }
    }
    Ok(entries)
}

/// None for a file whose author was never recorded.
pub fn added_by(project: &Project, id: Uuid) -> AppResult<Option<Author>> {
    let (kind, author_id) = project.lock().conn.query_row(
        "SELECT added_by_kind, added_by_id FROM assets WHERE id = ?1",
        params![id.to_string()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok(author(kind, author_id))
}

/// The author stored in an Asset's `added_by_kind` and `added_by_id` columns.
fn author(kind: Option<String>, id: Option<String>) -> Option<Author> {
    Some(Author { kind: AuthorKind::parse(&kind?)?, id: id? })
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
    use crate::comments::test_support::into_thread;
    use crate::conversations::{self, SendMessageInput};
    use crate::projects::test_support::{temp_project, user};

    #[test]
    fn a_rename_keeps_the_extension_and_the_id() {
        assert_eq!(renamed("field-trial.csv", "trial-2025"), "trial-2025.csv");
        assert_eq!(renamed("field-trial.csv", "trial-2025.CSV"), "trial-2025.csv");
        assert_eq!(renamed("README", "notes"), "notes");

        let (_dir, project) = temp_project();
        let asset = import_bytes(&project, "field-trial.csv", "text/csv", b"a,b", &user()).unwrap();
        let after = rename(&project, asset.id, " trial-2025 ").unwrap();
        assert_eq!((after.id, after.name.as_str()), (asset.id, "trial-2025.csv"));
        let path = file_path(&project, asset.id).unwrap();
        assert!(path.ends_with("trial-2025.csv"));
        assert_eq!(std::fs::read(path).unwrap(), b"a,b");
        assert!(rename(&project, asset.id, "a/b").is_err());
        assert!(rename(&project, asset.id, "   ").is_err());
        assert!(rename(&project, asset.id, ".csv").is_err());
    }

    #[test]
    fn a_duplicate_is_a_new_file_named_copy() {
        let (_dir, project) = temp_project();
        let asset = import_bytes(&project, "field-trial.csv", "text/csv", b"a,b", &user()).unwrap();
        let copy = duplicate(&project, asset.id, &user()).unwrap();
        assert_ne!(copy.id, asset.id);
        assert_eq!(copy.name, "field-trial copy.csv");
        assert_eq!(std::fs::read(file_path(&project, copy.id).unwrap()).unwrap(), b"a,b");

        let second = duplicate(&project, asset.id, &user()).unwrap();
        assert_eq!(second.name, "field-trial copy 2.csv");
        let of_copy = duplicate(&project, copy.id, &user()).unwrap();
        assert_eq!(of_copy.name, "field-trial copy 3.csv");
    }

    #[test]
    fn deleting_a_file_removes_its_record_and_folder() {
        let (_dir, project) = temp_project();
        let asset = import_bytes(&project, "field-trial.csv", "text/csv", b"a", &user()).unwrap();
        let folder = file_path(&project, asset.id).unwrap().parent().unwrap().to_path_buf();
        delete(&project, asset.id).unwrap();
        assert!(!folder.exists());
        assert!(find(&project.lock(), asset.id).is_err());
    }

    #[test]
    fn a_download_is_stored_under_its_name_with_where_it_came_from() {
        let (dir, project) = temp_project();
        let downloaded = dir.path().join("download-4311.tmp");
        std::fs::write(&downloaded, "plot,yield\n1,20\n").unwrap();
        let origin = AssetOrigin::Dataverse {
            file_id: 4311,
            dataset_id: "doi:10.21223/R694DO".into(),
            title: "Integrated management of late blight data".into(),
            url: "https://doi.org/10.21223/R694DO".into(),
        };

        let asset =
            import_downloaded(&project, &downloaded, "trial.csv", &user(), &origin).unwrap();
        assert_eq!((asset.name.as_str(), asset.media_type.as_str()), ("trial.csv", "text/csv"));
        let entry = project_files(&project).unwrap().into_iter().next().unwrap();
        assert_eq!((entry.source.as_str(), entry.origin.as_ref()), ("dataverse", Some(&origin)));
        assert_eq!(dataverse_files(&project.lock()).unwrap().get(&4311), Some(&asset));
        assert!(import_downloaded(&project, &downloaded, "../x.csv", &user(), &origin).is_err());
    }

    #[test]
    fn imported_generated_and_pasted_files_are_stored_and_registered() {
        let (dir, project) = temp_project();
        let source_of = |id: Uuid| -> String {
            let sql = "SELECT source FROM assets WHERE id = ?1";
            project.lock().conn.query_row(sql, params![id.to_string()], |r| r.get(0)).unwrap()
        };

        let source = dir.path().join("field-trial.csv");
        std::fs::write(&source, "plot,yield\n1,20\n").unwrap();
        let imported = import(&project, &source, &user()).unwrap();
        let summary = (imported.name.as_str(), imported.media_type.as_str(), imported.size_bytes);
        assert_eq!(summary, ("field-trial.csv", "text/csv", 16));
        let assets_folder = project.paths.root().join("assets");
        assert!(file_path(&project, imported.id).unwrap().starts_with(assets_folder));
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "plot,yield\n1,20\n");
        assert_eq!(find(&project.lock(), imported.id).unwrap(), imported);
        assert_eq!(source_of(imported.id), "upload");

        let generated =
            write_generated(&project, "theory-store.json", "application/json", b"{}", &user()).unwrap();
        let stored = file_path(&project, generated.id).unwrap();
        let expected = format!("assets/{}/theory-store.json", generated.id);
        assert_eq!(stored, project.paths.root().join(expected));
        assert_eq!(std::fs::read(stored).unwrap(), b"{}");
        assert_eq!(source_of(generated.id), "generated");

        let name = pasted_name("", "image/png");
        assert_eq!(name, "Pasted image.png");
        let pasted = import_bytes(&project, &name, "image/png", b"png", &user()).unwrap();
        assert_eq!(std::fs::read(file_path(&project, pasted.id).unwrap()).unwrap(), b"png");
        assert_eq!(source_of(pasted.id), "upload");
    }

    #[test]
    fn files_with_the_same_name_are_both_kept() {
        let (dir, project) = temp_project();
        let first_dir = dir.path().join("a");
        let second_dir = dir.path().join("b");
        std::fs::create_dir(&first_dir).unwrap();
        std::fs::create_dir(&second_dir).unwrap();
        std::fs::write(first_dir.join("data.csv"), "first").unwrap();
        std::fs::write(second_dir.join("data.csv"), "second").unwrap();
        let read = |id| std::fs::read_to_string(file_path(&project, id).unwrap()).unwrap();

        let first = import(&project, &first_dir.join("data.csv"), &user()).unwrap();
        let second = import(&project, &second_dir.join("data.csv"), &user()).unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!((read(first.id), read(second.id)), ("first".into(), "second".into()));

        let first = write_generated(&project, "theory-store.json", "", b"first", &user()).unwrap();
        let second = write_generated(&project, "theory-store.json", "", b"second", &user()).unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(first.media_type, "application/json");
        assert_eq!((read(first.id), read(second.id)), ("first".into(), "second".into()));
    }

    #[test]
    fn list_filters_by_name() {
        let (dir, project) = temp_project();
        for name in ["field-trial.csv", "notes.md", "Trial-2.xlsx"] {
            let source = dir.path().join(name);
            std::fs::write(&source, "x").unwrap();
            import(&project, &source, &user()).unwrap();
        }
        let names: Vec<String> = list(&project, Some("trial"))
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(names.len(), 2);
        assert!(names.iter().all(|n| n.to_lowercase().contains("trial")));
    }

    fn assets_folder_entries(project: &Project) -> usize {
        let folder = project.paths.root().join("assets");
        std::fs::read_dir(folder).map(|entries| entries.count()).unwrap_or(0)
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
            let err = write_generated(&project, name, "text/plain", b"x", &user()).unwrap_err();
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
    fn project_files_lists_who_added_each_asset_and_where_it_is_used() {
        let (dir, project) = temp_project();
        let source = dir.path().join("field-trial.csv");
        std::fs::write(&source, "plot,yield\n1,20\n").unwrap();
        let trial = import(&project, &source, &user()).unwrap();
        let unused = write_generated(&project, "notes.md", "", b"# Notes", &user()).unwrap();
        let first = conversations::create(&project).unwrap().id;
        let second = conversations::create(&project).unwrap().id;
        let user = new_id();
        let attach = SendMessageInput {
            content: "Summarize this".into(),
            attachments: vec![trial.id],
            text_components: Vec::new(),
        };
        conversations::send_message(&project, first, attach, user).unwrap();
        let reference = SendMessageInput {
            content: "#field-trial.csv again".into(),
            attachments: Vec::new(),
            text_components: vec![TextComponent {
                kind: TextComponentKind::Asset,
                id: trial.id,
                label: "#field-trial.csv".into(),
                start: 0,
                end: 16,
            }],
        };
        conversations::send_message(&project, second, reference, user).unwrap();

        let entries = project_files(&project).unwrap();
        let entry = |id| entries.iter().find(|e| e.asset.id == id).unwrap();
        assert_eq!(entry(trial.id).source, "upload");
        assert_eq!(entry(trial.id).added_by.as_ref().unwrap().kind, AuthorKind::User);
        let used: Vec<Uuid> = entry(trial.id).used_in.iter().map(|c| c.id).collect();
        assert_eq!(used, [first, second]);
        assert_eq!(entry(unused.id).source, "generated");
        assert_eq!(entry(unused.id).added_by, Some(crate::projects::test_support::user()));
        assert!(entry(unused.id).used_in.is_empty());
    }

    #[test]
    fn a_table_is_saved_under_its_title_made_safe() {
        assert_eq!(table_file_name("Yield by variety"), "Yield by variety.csv");
        assert_eq!(table_file_name("Plots 1/2"), "Plots 1-2.csv");
        assert_eq!(table_file_name("  "), "Table.csv");
        assert_eq!(table_file_name("field-trial.csv"), "field-trial.csv");
        assert_eq!(table_file_name("Harvest.XLSX"), "Harvest.csv");
    }

    #[test]
    fn a_pasted_name_falls_back_when_the_clipboard_gives_none_or_a_bad_one() {
        assert_eq!(pasted_name("field.jpg", "image/jpeg"), "field.jpg");
        assert_eq!(pasted_name("what?.png", "image/jpeg"), "Pasted image.jpg");
        assert_eq!(pasted_name("  ", "image/webp"), "Pasted image.webp");
        assert_eq!(pasted_name("", "image/x-unknown"), "Pasted image");
    }

    #[test]
    fn only_dropped_files_are_imported() {
        let (dir, project) = temp_project();
        let file = dir.path().join("plots.csv");
        std::fs::write(&file, "plot\n1").unwrap();
        let folder = dir.path().join("photos");
        std::fs::create_dir(&folder).unwrap();
        let dropped = [file.clone(), folder.clone()];

        let imported = import_dropped(&project, &dropped, &dropped, &user()).unwrap();
        assert_eq!(imported.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["plots.csv"]);

        let other = dir.path().join("secret.txt");
        std::fs::write(&other, "x").unwrap();
        let err = import_dropped(&project, &[file, other], &dropped, &user()).unwrap_err();
        assert_eq!(err.code, "invalid_input");
        assert_eq!(list(&project, None).unwrap().len(), 1);
    }

    #[test]
    fn only_images_are_read_for_thumbnails() {
        let (_dir, project) = temp_project();
        let image = import_bytes(&project, "field.png", "", b"png", &user()).unwrap();
        let table = import_bytes(&project, "plots.csv", "", b"plot", &user()).unwrap();
        assert_eq!(read_image(&project, image.id).unwrap(), ("image/png".into(), b"png".to_vec()));
        assert_eq!(read_image(&project, table.id).unwrap_err().code, "invalid_input");
    }

    #[test]
    fn a_thread_is_not_where_a_file_is_used() {
        let (_dir, project) = temp_project();
        let trial = import_bytes(&project, "trial.csv", "text/csv", b"a\n", &user()).unwrap();
        let thread = conversations::create(&project).unwrap().id;
        into_thread(&project, thread);
        let input = SendMessageInput {
            content: "see this".into(),
            attachments: vec![trial.id],
            text_components: Vec::new(),
        };
        conversations::send_message(&project, thread, input, new_id()).unwrap();
        let files = project_files(&project).unwrap();
        let entry = files.iter().find(|e| e.asset.id == trial.id).unwrap();
        assert!(entry.used_in.is_empty());
    }
}
