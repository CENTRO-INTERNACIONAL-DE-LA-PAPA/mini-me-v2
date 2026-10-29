//! Documents: Quarto Markdown (`.qmd`) Assets of a Project that the user creates and edits in
//! the document view. A document is an ordinary Asset, so Files, attachments and the read
//! tools see it like any other file; this module only creates, reads and rewrites them.

use rusqlite::params;
use uuid::Uuid;

use crate::assets;
use crate::error::{AppError, AppResult};
use crate::library::SCRIBE;
use crate::projects;
use crate::protocol::{AssetRef, Author, AuthorKind};
use crate::store::Project;

pub const EXTENSION: &str = ".qmd";
const MEDIA_TYPE: &str = "text/markdown";
/// The largest document the app saves, as for text files a Mini-Me saves.
const MAX_BYTES: usize = 2 * 1024 * 1024;

pub fn is_document(name: &str) -> bool {
    name.to_lowercase().ends_with(EXTENSION)
}

/// The file name for a document titled `title`: the title with characters no file system
/// allows replaced, and the `.qmd` extension.
pub fn file_name(title: &str) -> String {
    format!("{}{EXTENSION}", projects::folder_name(title))
}

/// A YAML header with `title` and, when given, `author`. Values are JSON strings, which YAML
/// reads as quoted strings, so any title is safe.
pub fn header(title: &str, author: Option<&str>) -> String {
    let quote = |value: &str| serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into());
    let mut header = format!("---\ntitle: {}\n", quote(title));
    if let Some(author) = author.map(str::trim).filter(|a| !a.is_empty()) {
        header.push_str(&format!("author: {}\n", quote(author)));
    }
    header.push_str("---\n\n");
    header
}

/// Creates an empty document titled `title`, added by `user` and with `author` in its header,
/// and returns its Asset.
pub fn create(
    project: &Project,
    title: &str,
    author: Option<&str>,
    user: &Author,
) -> AppResult<AssetRef> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid_input("A document needs a title."));
    }
    let header = header(title, author);
    let asset = assets::import_bytes(project, &file_name(title), MEDIA_TYPE, header.as_bytes())?;
    assets::set_added_by(project, asset.id, user)?;
    Ok(asset)
}

/// The text of the document `id`.
pub fn read(project: &Project, id: Uuid) -> AppResult<String> {
    let path = document_path(project, id)?;
    String::from_utf8(std::fs::read(path)?)
        .map_err(|_| AppError::invalid_input("This document is not readable text."))
}

/// Replaces the text of the document `id`, through a temporary file so a failed write leaves
/// the previous version whole.
pub fn save(project: &Project, id: Uuid, text: &str) -> AppResult<()> {
    write(project, id, text, None)
}

/// Replaces the text of the document `id` as `save` does, and records `added_by` with the new
/// size when given.
fn write(project: &Project, id: Uuid, text: &str, added_by: Option<&Author>) -> AppResult<()> {
    if text.len() > MAX_BYTES {
        return Err(AppError::invalid_input("A document can be at most 2 MiB."));
    }
    let path = document_path(project, id)?;
    let tmp = path.with_extension("qmd.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, &path)?;
    project.lock().conn.execute(
        "UPDATE assets SET size_bytes = ?1, added_by_kind = COALESCE(?2, added_by_kind), \
         added_by_id = COALESCE(?3, added_by_id) WHERE id = ?4",
        params![
            text.len() as i64,
            added_by.map(|a| a.kind.as_str()),
            added_by.map(|a| a.id.as_str()),
            id.to_string()
        ],
    )?;
    Ok(())
}

/// Writes a drafted `body` after the document's current text, its header, keeping the header
/// unchanged. A document that held only its YAML header becomes Scribe's, so Files lists
/// Scribe as who added it. An empty draft leaves the document as it is.
pub fn save_draft(project: &Project, id: Uuid, header: &str, body: &str) -> AppResult<()> {
    let body = body.trim();
    if body.is_empty() {
        return Ok(());
    }
    let scribe = Author { kind: AuthorKind::MiniMe, id: SCRIBE.to_string() };
    let added_by = only_header(header).then_some(&scribe);
    write(project, id, &format!("{}\n\n{body}\n", header.trim_end_matches('\n')), added_by)
}

/// Whether `text` is a YAML header with nothing after it.
fn only_header(text: &str) -> bool {
    let Some(rest) = text.trim_start().strip_prefix("---\n") else {
        return false;
    };
    rest.split_once("\n---").is_some_and(|(_, after)| after.trim().is_empty())
}

/// The name of the PDF exported from the document `name`: `report.qmd` gives `report.pdf`.
pub fn pdf_name(name: &str) -> String {
    let stem = if is_document(name) { &name[..name.len() - EXTENSION.len()] } else { name };
    format!("{stem}.pdf")
}

/// Stores the PDF exported from the document `id`, named `name`, as a generated Asset of the
/// Project, added by whoever added the document.
pub fn store_pdf(project: &Project, id: Uuid, name: &str, pdf: &[u8]) -> AppResult<AssetRef> {
    let added_by = assets::added_by(project, id)?;
    let asset = assets::write_generated(project, &pdf_name(name), "application/pdf", pdf)?;
    if let Some(author) = added_by {
        assets::set_added_by(project, asset.id, &author)?;
    }
    Ok(asset)
}

/// The file of the Asset `id`, which must be a document of this Project.
fn document_path(project: &Project, id: Uuid) -> AppResult<std::path::PathBuf> {
    let asset = assets::find(&project.lock(), id)?;
    if !is_document(&asset.name) {
        return Err(AppError::invalid_input(format!("\"{}\" is not a document.", asset.name)));
    }
    assets::file_path(project, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::temp_project;

    fn user() -> Author {
        Author { kind: AuthorKind::User, id: "u".into() }
    }

    #[test]
    fn a_new_document_has_a_header_with_its_title_and_author() {
        let (_dir, project) = temp_project();
        let asset = create(&project, "Trials: 2026/27", Some("Ana Pérez"), &user()).unwrap();
        assert_eq!(asset.name, "Trials- 2026-27.qmd");
        assert_eq!(
            read(&project, asset.id).unwrap(),
            "---\ntitle: \"Trials: 2026/27\"\nauthor: \"Ana Pérez\"\n---\n\n"
        );
    }

    #[test]
    fn saving_replaces_the_text_and_its_size() {
        let (_dir, project) = temp_project();
        let asset = create(&project, "Report", None, &user()).unwrap();
        let text = "---\ntitle: Report\n---\n\n# Summary\n";
        save(&project, asset.id, text).unwrap();
        assert_eq!(read(&project, asset.id).unwrap(), text);
        let size = assets::find(&project.lock(), asset.id).unwrap().size_bytes;
        assert_eq!(size, text.len() as i64);
    }

    #[test]
    fn only_documents_are_saved() {
        let (_dir, project) = temp_project();
        let csv = assets::import_bytes(&project, "field-trial.csv", "text/csv", b"a,b\n").unwrap();
        let error = save(&project, csv.id, "# Not a table").unwrap_err();
        assert_eq!(error.code, "invalid_input");
        let path = assets::file_path(&project, csv.id).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"a,b\n");
    }

    #[test]
    fn a_draft_follows_the_header() {
        let (_dir, project) = temp_project();
        let asset = create(&project, "Trial design", None, &user()).unwrap();
        let header = read(&project, asset.id).unwrap();
        save_draft(&project, asset.id, &header, "\n# Summary\n\nYield fell.\n\n").unwrap();
        assert_eq!(
            read(&project, asset.id).unwrap(),
            "---\ntitle: \"Trial design\"\n---\n\n# Summary\n\nYield fell.\n"
        );
        save_draft(&project, asset.id, &header, "   ").unwrap();
        assert!(read(&project, asset.id).unwrap().ends_with("Yield fell.\n"));
    }

    #[test]
    fn a_draft_makes_a_blank_document_scribes_and_its_pdf_follows() {
        let (_dir, project) = temp_project();
        let added_by = |id: Uuid| assets::added_by(&project, id).unwrap();
        let scribe = Some(Author { kind: AuthorKind::MiniMe, id: SCRIBE.to_string() });
        let notes = create(&project, "Notes", None, &user()).unwrap();
        let pdf = store_pdf(&project, notes.id, &notes.name, b"%PDF-1.7").unwrap();
        assert_eq!(added_by(pdf.id), Some(user()));
        let drafted = create(&project, "Trial design", None, &user()).unwrap();
        let header = read(&project, drafted.id).unwrap();
        save_draft(&project, drafted.id, &header, "# Summary").unwrap();
        assert_eq!(added_by(drafted.id), scribe);
        let pdf = store_pdf(&project, drafted.id, &drafted.name, b"%PDF-1.7").unwrap();
        assert_eq!(added_by(pdf.id), scribe);
        // Drafting after text the user wrote keeps the document theirs.
        save(&project, notes.id, "---\ntitle: Notes\n---\n\nMine.\n").unwrap();
        let text = read(&project, notes.id).unwrap();
        save_draft(&project, notes.id, &text, "# More").unwrap();
        assert_eq!(added_by(notes.id), Some(user()));
    }

    #[test]
    fn a_pdf_is_named_after_its_document() {
        let (_dir, project) = temp_project();
        assert_eq!(pdf_name("Huancayo 2025 report.qmd"), "Huancayo 2025 report.pdf");
        let report = create(&project, "Report", None, &user()).unwrap();
        let pdf = store_pdf(&project, report.id, &report.name, b"%PDF-1.7").unwrap();
        assert_eq!((pdf.name.as_str(), pdf.media_type.as_str()), ("Report.pdf", "application/pdf"));
    }

    #[test]
    fn a_failed_save_leaves_the_document_whole() {
        let (_dir, project) = temp_project();
        let asset = create(&project, "Report", None, &user()).unwrap();
        let path = assets::file_path(&project, asset.id).unwrap();
        // A directory where the temporary file would go makes the write fail.
        std::fs::create_dir(path.with_extension("qmd.tmp")).unwrap();
        assert!(save(&project, asset.id, "# New").is_err());
        assert_eq!(read(&project, asset.id).unwrap(), "---\ntitle: \"Report\"\n---\n\n");
    }
}
