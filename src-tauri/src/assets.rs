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
use crate::store::{Project, ProjectState, parse_id, unreadable};

/// Where an Asset downloaded from outside the Project came from.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AssetOrigin {
    /// A Dataverse file: its file ID there, and its dataset's persistent ID, title and web address.
    Dataverse { file_id: u64, dataset_id: String, title: String, url: String },
}

/// Stored in the `source` column as its serialized name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetSource {
    Upload,
    /// Made by the app, such as a Mini-Me's output or an exported PDF.
    Generated,
    Dataverse,
}

impl AssetSource {
    fn as_str(self) -> &'static str {
        match self {
            AssetSource::Upload => "upload",
            AssetSource::Generated => "generated",
            AssetSource::Dataverse => "dataverse",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        [AssetSource::Upload, AssetSource::Generated, AssetSource::Dataverse]
            .into_iter()
            .find(|source| source.as_str() == value)
    }
}

/// Copies a file the user picked into the Project; the original is only read.
pub fn import(project: &Project, source: &Path, user: &Author) -> AppResult<AssetRef> {
    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| AppError::invalid_input("The selected item is not a file."))?;
    copy_in(project, source, &name, (AssetSource::Upload, user), None)
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
        AssetOrigin::Dataverse { .. } => AssetSource::Dataverse,
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
    (kind, author): (AssetSource, &Author),
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
    register(project, asset, (kind, author), &rel_path, origin, false).inspect_err(|_| {
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
/// `media_type` is guessed from the name. A `hidden` Asset is never listed to the user.
pub fn write_generated(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
    author: &Author,
    hidden: bool,
) -> AppResult<AssetRef> {
    store(
        project,
        name,
        media_type,
        bytes,
        (AssetSource::Generated, author),
        hidden,
    )
}

/// Stores bytes the user pasted or started, such as a blank document, as an `upload` Asset.
pub fn import_bytes(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
    user: &Author,
) -> AppResult<AssetRef> {
    store(
        project,
        name,
        media_type,
        bytes,
        (AssetSource::Upload, user),
        false,
    )
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
    (source, author): (AssetSource, &Author),
    hidden: bool,
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
    register(project, asset, (source, author), &rel_path, None, hidden).inspect_err(|_| {
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

fn register(
    project: &Project,
    asset: AssetRef,
    (source, author): (AssetSource, &Author),
    rel_path: &str,
    origin: Option<&AssetOrigin>,
    hidden: bool,
) -> AppResult<AssetRef> {
    let origin = origin.map(serde_json::to_string).transpose()?;
    project.lock().conn.execute(
        "INSERT INTO assets (id, name, media_type, size_bytes, source, rel_path, created_at, \
         added_by_kind, added_by_id, origin, hidden) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            asset.id.to_string(),
            asset.name,
            asset.media_type,
            asset.size_bytes,
            source.as_str(),
            rel_path,
            now_ms(),
            author.kind.as_str(),
            author.id,
            origin,
            hidden
        ],
    )?;
    Ok(asset)
}

/// Fails with `not_found` if the Asset is not in this Project.
pub fn find(state: &ProjectState, id: Uuid) -> AppResult<AssetRef> {
    find_with_hidden(state, id).map(|(asset, _)| asset)
}

/// The Asset and whether it is hidden; fails with `not_found` if it is not in this Project.
pub fn find_with_hidden(state: &ProjectState, id: Uuid) -> AppResult<(AssetRef, bool)> {
    state
        .conn
        .query_row(
            "SELECT name, media_type, size_bytes, hidden FROM assets WHERE id = ?1",
            params![id.to_string()],
            |row| {
                let asset = AssetRef {
                    id,
                    name: row.get(0)?,
                    media_type: row.get(1)?,
                    size_bytes: row.get(2)?,
                };
                Ok((asset, row.get(3)?))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::not_found("That file is not part of this Project."))
}

/// Assets the user can see whose name contains `query` (case-insensitive), newest first.
pub fn list(project: &Project, query: Option<&str>) -> AppResult<Vec<AssetRef>> {
    let state = project.lock();
    let mut stmt = state.conn.prepare(
        "SELECT id, name, media_type, size_bytes FROM assets WHERE hidden = 0 \
         ORDER BY created_at DESC",
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
    pub source: AssetSource,
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

/// Every Asset of the Project the user can see, newest first, with who added it and where it is
/// used.
pub fn project_files(project: &Project) -> AppResult<Vec<FileEntry>> {
    let state = project.lock();
    let mut entries = file_entries(project, &state)?;
    add_used_in(&state, &mut entries)?;
    Ok(entries)
}

struct AssetRow {
    id: String,
    name: String,
    media_type: String,
    size_bytes: i64,
    source: String,
    created_at: i64,
    rel_path: String,
    added_by_kind: Option<String>,
    added_by_id: Option<String>,
    origin: Option<String>,
}

/// Every Asset the user can see, newest first, with `used_in` left empty.
fn file_entries(project: &Project, state: &ProjectState) -> AppResult<Vec<FileEntry>> {
    let mut stmt = state.conn.prepare(
        "SELECT id, name, media_type, size_bytes, source, created_at, rel_path, \
         added_by_kind, added_by_id, origin FROM assets WHERE hidden = 0 \
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AssetRow {
            id: row.get(0)?,
            name: row.get(1)?,
            media_type: row.get(2)?,
            size_bytes: row.get(3)?,
            source: row.get(4)?,
            created_at: row.get(5)?,
            rel_path: row.get(6)?,
            added_by_kind: row.get(7)?,
            added_by_id: row.get(8)?,
            origin: row.get(9)?,
        })
    })?;
    let mut entries = Vec::new();
    for row in rows {
        let row = row?;
        let id = parse_id(&row.id, "ID")?;
        let metadata = project
            .paths
            .resolve(&row.rel_path)
            .ok()
            .and_then(|path| std::fs::metadata(path).ok());
        let modified_at = metadata
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|since| since.as_millis() as i64);
        let size_bytes = match metadata {
            Some(metadata) => keep_size(state, id, metadata.len() as i64)?,
            None => row.size_bytes,
        };
        entries.push(FileEntry {
            asset: AssetRef {
                id,
                name: row.name,
                media_type: row.media_type,
                size_bytes,
            },
            source: AssetSource::parse(&row.source).ok_or_else(|| unreadable("Asset"))?,
            origin: row.origin.and_then(|o| serde_json::from_str(&o).ok()),
            created_at: row.created_at,
            modified_at,
            added_by: author(row.added_by_kind, row.added_by_id),
            used_in: Vec::new(),
        });
    }
    Ok(entries)
}

/// Stores `size_bytes` as the Asset's size, since its file can change outside the app; returns it.
pub fn keep_size(state: &ProjectState, id: Uuid, size_bytes: i64) -> AppResult<i64> {
    state.conn.execute(
        "UPDATE assets SET size_bytes = ?1 WHERE id = ?2 AND size_bytes != ?1",
        params![size_bytes, id.to_string()],
    )?;
    Ok(size_bytes)
}

fn add_used_in(state: &ProjectState, entries: &mut [FileEntry]) -> AppResult<()> {
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
    Ok(())
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
    use crate::projects::test_support::{temp_project, user};

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
        assert_eq!(
            (read(first.id), read(second.id)),
            ("first".into(), "second".into())
        );

        let first =
            write_generated(&project, "theory-store.json", "", b"first", &user(), false).unwrap();
        let second =
            write_generated(&project, "theory-store.json", "", b"second", &user(), false).unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(first.media_type, "application/json");
        assert_eq!(
            (read(first.id), read(second.id)),
            ("first".into(), "second".into())
        );
    }

    fn assets_folder_entries(project: &Project) -> usize {
        let folder = project.paths.root().join("assets");
        std::fs::read_dir(folder).map(|entries| entries.count()).unwrap_or(0)
    }

    #[test]
    fn names_that_could_leave_the_folder_or_fail_on_windows_are_refused() {
        let (dir, project) = temp_project();
        let long = "a".repeat(256);
        let names = [
            "", "../../notes.txt", "a/b.txt", "a\\b.txt", "..", ".", "notes?.txt", "notes.", "NUL",
            "nul.txt", "Com1.json", "con .txt", &long,
        ];
        for name in names {
            let err =
                write_generated(&project, name, "text/plain", b"x", &user(), false).unwrap_err();
            assert_eq!(err.code, "invalid_input", "{name}");
        }
        assert_eq!(assets_folder_entries(&project), 0);
        assert!(list(&project, None).unwrap().is_empty());

        let downloaded = dir.path().join("download-4311.tmp");
        std::fs::write(&downloaded, "plot,yield\n1,20\n").unwrap();
        let origin = AssetOrigin::Dataverse {
            file_id: 4311,
            dataset_id: "doi:10.21223/R694DO".into(),
            title: "Integrated management of late blight data".into(),
            url: "https://doi.org/10.21223/R694DO".into(),
        };
        assert!(import_downloaded(&project, &downloaded, "../x.csv", &user(), &origin).is_err());

        let asset = import_bytes(&project, "field-trial.csv", "text/csv", b"a,b", &user()).unwrap();
        assert!(rename(&project, asset.id, "a/b").is_err());

        for name in ["results..final.csv", "a...b.json", "console.txt", "nullable.md", ".env"] {
            assert!(check_name(name).is_ok(), "{name}");
        }
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
}
