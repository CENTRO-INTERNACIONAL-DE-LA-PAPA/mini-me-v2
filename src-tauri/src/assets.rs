//! The per-Project Asset registry. Asset files live in `assets/<asset-id>/<file name>`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::protocol::{
    AssetRef, Author, AuthorKind, TextComponent, TextComponentKind, new_id, now_ms,
};
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

/// Imports the files of `paths` that the user dropped on the window. Every path must be one of
/// `dropped`, the paths the operating system reported for the latest drop, so the UI cannot
/// name a file of its own; folders are skipped.
pub fn import_dropped(
    project: &Project,
    paths: &[PathBuf],
    dropped: &[PathBuf],
) -> AppResult<Vec<AssetRef>> {
    if let Some(path) = paths.iter().find(|path| !dropped.contains(path)) {
        return Err(AppError::invalid_input(format!(
            "{} was not dropped on Mini-Me.",
            path.display()
        )));
    }
    paths.iter().filter(|path| path.is_file()).map(|path| import(project, path)).collect()
}

/// Media types every webview the app runs in can draw as an image.
pub const THUMBNAIL_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/// The media type and bytes of an image Asset, for its thumbnail. Other media types are
/// refused.
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

/// Refuses a name for a stored Asset that is empty, longer than 255 characters, or could
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
    store(project, name, media_type, bytes, "generated")
}

/// Stores bytes the user pasted as an `upload` Asset named `name`.
pub fn import_bytes(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
) -> AppResult<AssetRef> {
    store(project, name, media_type, bytes, "upload")
}

/// The name of a pasted image: the clipboard's file name when it gives a usable one, else
/// `Pasted image` with the usual extension of `media_type`.
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

/// Writes `bytes` to a new folder under `assets` and registers them with `source`.
/// `media_type` falls back to one guessed from the name when empty.
fn store(
    project: &Project,
    name: &str,
    media_type: &str,
    bytes: &[u8],
    source: &str,
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
    register(project, asset, source, &rel_path).inspect_err(|_| {
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

/// An Asset as the Project's Files screen lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileEntry {
    #[serde(flatten)]
    pub asset: AssetRef,
    /// `upload` for a file the user imported or started, `generated` for one the app made,
    /// such as a Mini-Me's output or an exported PDF.
    pub source: String,
    /// When the Asset was registered, in milliseconds.
    pub created_at: i64,
    /// When its file last changed, in milliseconds; none when the file is missing.
    pub modified_at: Option<i64>,
    /// Who added the Asset: the author stored with it, else the author of the first message
    /// it is attached to; none when neither says.
    pub added_by: Option<Author>,
    /// The Conversations whose messages attach or reference the Asset, in the order it first
    /// appeared in them.
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
    let corrupt = || AppError::storage("stored ID is not readable");
    let mut entries = Vec::new();
    {
        let mut stmt = state.conn.prepare(
            "SELECT id, name, media_type, size_bytes, source, created_at, rel_path, \
             added_by_kind, added_by_id FROM assets ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
            ))
        })?;
        for row in rows {
            let (id, name, media_type, size_bytes, source, created_at, rel_path, by_kind, by_id) =
                row?;
            let added_by = by_kind
                .as_deref()
                .and_then(AuthorKind::parse)
                .zip(by_id)
                .map(|(kind, id)| Author { kind, id });
            let modified_at = project
                .paths
                .resolve(&rel_path)
                .ok()
                .and_then(|path| std::fs::metadata(path).ok()?.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|since| since.as_millis() as i64);
            entries.push(FileEntry {
                asset: AssetRef {
                    id: Uuid::parse_str(&id).map_err(|_| corrupt())?,
                    name,
                    media_type,
                    size_bytes,
                },
                source,
                created_at,
                modified_at,
                added_by,
                used_in: Vec::new(),
            });
        }
    }
    let index: HashMap<Uuid, usize> =
        entries.iter().enumerate().map(|(i, e)| (e.asset.id, i)).collect();

    let mut stmt = state.conn.prepare(
        "SELECT m.conversation_id, c.title, m.author_kind, m.author_id, m.attachments, \
         m.text_components FROM messages m JOIN conversations c ON c.id = m.conversation_id \
         ORDER BY m.rowid",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;
    for row in rows {
        let (conversation, title, author_kind, author_id, attachments, text_components) = row?;
        let conversation = Uuid::parse_str(&conversation).map_err(|_| corrupt())?;
        let attached: Vec<AssetRef> = serde_json::from_str(&attachments)?;
        let referenced: Vec<TextComponent> = serde_json::from_str(&text_components)?;
        let author = AuthorKind::parse(&author_kind).map(|kind| Author { kind, id: author_id });
        let ids = attached.iter().map(|a| (a.id, true)).chain(
            referenced
                .iter()
                .filter(|t| t.kind == TextComponentKind::Asset)
                .map(|t| (t.id, false)),
        );
        for (id, is_attachment) in ids {
            let Some(entry) = index.get(&id).map(|&i| &mut entries[i]) else {
                continue;
            };
            if is_attachment && entry.added_by.is_none() {
                entry.added_by = author.clone();
            }
            if !entry.used_in.iter().any(|c| c.id == conversation) {
                entry.used_in.push(ConversationRef { id: conversation, title: title.clone() });
            }
        }
    }
    Ok(entries)
}

/// Records `author` as who added the Asset `id`, ahead of the messages that attach it.
pub fn set_added_by(project: &Project, id: Uuid, author: &Author) -> AppResult<()> {
    project.lock().conn.execute(
        "UPDATE assets SET added_by_kind = ?1, added_by_id = ?2 WHERE id = ?3",
        params![author.kind.as_str(), author.id, id.to_string()],
    )?;
    Ok(())
}

/// Who added the Asset `id`, as the Files screen shows it: the author recorded with it, else
/// the author of the first message that attaches it.
pub fn added_by(project: &Project, id: Uuid) -> AppResult<Option<Author>> {
    let state = project.lock();
    let (kind, author_id): (Option<String>, Option<String>) = state.conn.query_row(
        "SELECT added_by_kind, added_by_id FROM assets WHERE id = ?1",
        params![id.to_string()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if let Some(author) =
        kind.as_deref().and_then(AuthorKind::parse).zip(author_id).map(|(kind, id)| Author { kind, id })
    {
        return Ok(Some(author));
    }
    // A cheap text match narrows the messages; the attachments are then read to be sure.
    let mut stmt = state.conn.prepare(
        "SELECT author_kind, author_id, attachments FROM messages WHERE attachments LIKE ?1 \
         ORDER BY rowid",
    )?;
    let rows = stmt.query_map(params![format!("%{id}%")], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    })?;
    for row in rows {
        let (kind, author_id, attachments) = row?;
        let attached: Vec<AssetRef> = serde_json::from_str(&attachments)?;
        if attached.iter().any(|a| a.id == id) {
            return Ok(AuthorKind::parse(&kind).map(|kind| Author { kind, id: author_id }));
        }
    }
    Ok(None)
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

    #[test]
    fn project_files_lists_who_added_each_asset_and_where_it_is_used() {
        use crate::conversations::{self, SendMessageInput};
        let (dir, project) = temp_project();
        let source = dir.path().join("field-trial.csv");
        std::fs::write(&source, "plot,yield\n1,20\n").unwrap();
        let trial = import(&project, &source).unwrap();
        let unused = write_generated(&project, "notes.md", "", b"# Notes").unwrap();
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
        assert!(entry(unused.id).added_by.is_none() && entry(unused.id).used_in.is_empty());
    }

    #[test]
    fn a_pasted_image_is_stored_as_an_upload() {
        let (_dir, project) = temp_project();
        let name = pasted_name("", "image/png");
        assert_eq!(name, "Pasted image.png");
        let asset = import_bytes(&project, &name, "image/png", b"png").unwrap();
        assert_eq!((asset.name.as_str(), asset.size_bytes), ("Pasted image.png", 3));
        assert_eq!(std::fs::read(file_path(&project, asset.id).unwrap()).unwrap(), b"png");
        let source: String = project
            .lock()
            .conn
            .query_row("SELECT source FROM assets WHERE id = ?1", [asset.id.to_string()], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(source, "upload");
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

        let imported = import_dropped(&project, &dropped, &dropped).unwrap();
        assert_eq!(imported.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["plots.csv"]);

        let other = dir.path().join("secret.txt");
        std::fs::write(&other, "x").unwrap();
        let err = import_dropped(&project, &[file, other], &dropped).unwrap_err();
        assert_eq!(err.code, "invalid_input");
        assert_eq!(list(&project, None).unwrap().len(), 1);
    }

    #[test]
    fn only_images_are_read_for_thumbnails() {
        let (_dir, project) = temp_project();
        let image = import_bytes(&project, "field.png", "", b"png").unwrap();
        let table = import_bytes(&project, "plots.csv", "", b"plot").unwrap();
        assert_eq!(read_image(&project, image.id).unwrap(), ("image/png".into(), b"png".to_vec()));
        assert_eq!(read_image(&project, table.id).unwrap_err().code, "invalid_input");
    }
}
