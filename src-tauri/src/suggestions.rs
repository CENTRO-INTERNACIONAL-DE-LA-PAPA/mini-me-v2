//! Suggestions: replacements of a document's passage that Mini-Mes propose and the user accepts or
//! discards in the document's source. They belong to the document, not to where they were made.

use rusqlite::{Connection, params};
use serde::Serialize;
use uuid::Uuid;

use crate::assets;
use crate::comments::{self, CommentThread};
use crate::documents::{self, Anchor, Anchors, passage};
use crate::error::{AppError, AppResult};
use crate::protocol::{Author, AuthorKind, new_id, now_ms};
use crate::store::{Project, ProjectState, parse_id, unreadable};

/// In bytes.
const MAX_TEXT_BYTES: usize = 64 * 1024;

/// A waiting suggestion. `start` and `end` are UTF-16 offsets in the document's source, `quote` is
/// the passage's text when last saved and `base` its text when suggested.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Suggestion {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub start: u32,
    pub end: u32,
    pub quote: String,
    pub base: String,
    pub text: String,
    pub author: Author,
    pub created_at: i64,
}

/// The document after an accepted suggestion, with its re-anchored threads and suggestions.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Accepted {
    pub text: String,
    pub threads: Vec<CommentThread>,
    pub suggestions: Vec<Suggestion>,
}

/// Adds a waiting suggestion replacing the one passage that reads `find` with `text`, and marks the
/// waiting suggestions it overlaps replaced. The document's file is only read.
pub fn add(
    project: &Project,
    asset_id: Uuid,
    author: &Author,
    find: &str,
    text: &str,
) -> AppResult<Uuid> {
    if find.is_empty() {
        return Err(AppError::invalid_input("Quote the passage to replace."));
    }
    if text.len() > MAX_TEXT_BYTES {
        return Err(AppError::invalid_input(
            "The new text is larger than 64 KiB; suggest smaller changes.",
        ));
    }
    let name = match assets::find(&project.lock(), asset_id) {
        Ok(asset) if documents::is_document(&asset.name) => asset.name,
        _ => {
            return Err(AppError::new(
                "not_a_document",
                "Only a .qmd document of this Project can get suggestions.",
            ));
        }
    };
    let document = documents::read(project, asset_id)?;
    let (start, end) = only_passage(&document, &name, find)?;
    insert(project, asset_id, author, (start, end, find), text)
}

/// Waiting suggestions of the document, in the order they were made.
pub fn list(project: &Project, asset_id: Uuid) -> AppResult<Vec<Suggestion>> {
    waiting_where(&project.lock(), "asset_id = ?1", asset_id)
}

/// Applies the waiting suggestion as `apply` does and marks it accepted.
pub fn accept(project: &Project, id: Uuid) -> AppResult<Accepted> {
    let suggestion = waiting_where(&project.lock(), "id = ?1", id)?
        .pop()
        .ok_or_else(|| AppError::not_found("No such waiting suggestion."))?;
    let asset_id = suggestion.asset_id;
    let place = (suggestion.start, suggestion.end, suggestion.quote.as_str());
    let text = apply(project, asset_id, place, &suggestion.base, &suggestion.text)?;
    project.lock().conn.execute(
        "UPDATE suggestions SET state = 'accepted' WHERE id = ?1",
        params![id.to_string()],
    )?;
    Ok(Accepted {
        text,
        threads: comments::list(project, asset_id)?,
        suggestions: list(project, asset_id)?,
    })
}

/// Merges the change from `base` to `text` into the passage at `start..end`, as the user has edited
/// it since, and saves the document with every thread and suggestion anchor shifted; returns the
/// new text. Changes nothing on `suggestion_detached` (the passage no longer reads `quote`) or
/// `suggestion_conflict` (the user changed the same words).
fn apply(
    project: &Project,
    asset_id: Uuid,
    (start, end, quote): (u32, u32, &str),
    base: &str,
    text: &str,
) -> AppResult<String> {
    let document = documents::read(project, asset_id)?;
    let ours = passage(&document, start, end).filter(|p| p == quote).ok_or_else(|| {
        AppError::new("suggestion_detached", "This passage can't be found in the document.")
    })?;
    let merged = merge(base, &ours, text).ok_or_else(|| {
        AppError::new(
            "suggestion_conflict",
            "You've changed the same words since this was suggested. Discard it, or ask for a new \
             suggestion.",
        )
    })?;

    let units: Vec<u16> = document.encode_utf16().collect();
    let (start, end) = (start as usize, end as usize);
    let merged_units: Vec<u16> = merged.encode_utf16().collect();
    let new_units = [&units[..start], &merged_units, &units[end..]].concat();
    let new_text = String::from_utf16_lossy(&new_units);
    // Positions after the passage shift by its change in length; those inside stop at its new end.
    let new_end = start + merged_units.len();
    let moved = |id: Uuid, (from, to): (u32, u32)| -> Anchor {
        let shift = |at: u32| -> u32 {
            let at = at as usize;
            let moved = if at <= start {
                at
            } else if at >= end {
                at + new_end - end
            } else {
                at.min(new_end)
            };
            moved as u32
        };
        Anchor { id, start: shift(from), end: shift(to) }
    };
    let anchors = Anchors {
        threads: comments::list(project, asset_id)?
            .iter()
            .map(|t| moved(t.conversation_id, (t.start, t.end)))
            .collect(),
        suggestions: list(project, asset_id)?
            .iter()
            .map(|s| moved(s.id, (s.start, s.end)))
            .collect(),
    };
    documents::save(project, asset_id, &new_text, &anchors)?;
    Ok(new_text)
}

/// Leaves the document unchanged.
pub fn discard(project: &Project, id: Uuid) -> AppResult<()> {
    let changed = project.lock().conn.execute(
        "UPDATE suggestions SET state = 'discarded' WHERE id = ?1 AND state = 'waiting'",
        params![id.to_string()],
    )?;
    match changed {
        0 => Err(AppError::not_found("No such waiting suggestion.")),
        _ => Ok(()),
    }
}

/// Moves `asset_id`'s waiting suggestions to `anchors` in its saved `text`, each quoting its new
/// passage. An anchor outside the text, or of another document's suggestion, changes nothing.
pub fn move_anchors(
    conn: &Connection,
    asset_id: Uuid,
    text: &str,
    anchors: &[Anchor],
) -> AppResult<()> {
    for anchor in anchors {
        let Some(quote) = passage(text, anchor.start, anchor.end) else {
            continue;
        };
        conn.execute(
            "UPDATE suggestions SET passage_start = ?1, passage_end = ?2, quote = ?3 \
             WHERE id = ?4 AND asset_id = ?5 AND state = 'waiting'",
            params![anchor.start, anchor.end, quote, anchor.id.to_string(), asset_id.to_string()],
        )?;
    }
    Ok(())
}

/// Waiting suggestions whose `condition` on `?1` holds, in the order they were made.
fn waiting_where(state: &ProjectState, condition: &str, id: Uuid) -> AppResult<Vec<Suggestion>> {
    let mut stmt = state.conn.prepare(&format!(
        "SELECT id, asset_id, passage_start, passage_end, quote, base, text, author_kind, \
         author_id, created_at FROM suggestions WHERE {condition} AND state = 'waiting' \
         ORDER BY created_at, rowid"
    ))?;
    let rows = stmt.query_map(params![id.to_string()], |row| {
        Ok(SuggestionRow {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            start: row.get(2)?,
            end: row.get(3)?,
            quote: row.get(4)?,
            base: row.get(5)?,
            text: row.get(6)?,
            author_kind: row.get(7)?,
            author_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    let mut suggestions = Vec::new();
    for row in rows {
        let row = row?;
        let kind = AuthorKind::parse(&row.author_kind).ok_or_else(|| unreadable("author"))?;
        suggestions.push(Suggestion {
            id: parse_id(&row.id, "ID")?,
            asset_id: parse_id(&row.asset_id, "ID")?,
            start: row.start,
            end: row.end,
            quote: row.quote,
            base: row.base,
            text: row.text,
            author: Author { kind, id: row.author_id },
            created_at: row.created_at,
        });
    }
    Ok(suggestions)
}

struct SuggestionRow {
    id: String,
    asset_id: String,
    start: u32,
    end: u32,
    quote: String,
    base: String,
    text: String,
    author_kind: String,
    author_id: String,
    created_at: i64,
}

/// Stands in for a newline while text is split one word per line for `diffy`'s line-based merge.
const NEWLINE: char = '\u{E000}';

/// `ours` with the change from `base` to `theirs` applied word by word; none when both change the
/// same words.
fn merge(base: &str, ours: &str, theirs: &str) -> Option<String> {
    if ours == base {
        return Some(theirs.to_string());
    }
    let merged = diffy::merge(&word_lines(base), &word_lines(ours), &word_lines(theirs)).ok()?;
    Some(merged.replace('\n', "").replace(NEWLINE, "\n"))
}

/// `text` as one word per line, each word with the whitespace after it.
fn word_lines(text: &str) -> String {
    let escaped = text.replace('\n', &NEWLINE.to_string());
    let mut lines = String::new();
    for word in escaped.split_inclusive(|c: char| c.is_whitespace() || c == NEWLINE) {
        lines.push_str(word);
        lines.push('\n');
    }
    lines
}

/// `find`'s place in `document` as a UTF-16 range; it must occur exactly once.
fn only_passage(document: &str, name: &str, find: &str) -> AppResult<(u32, u32)> {
    let at: Vec<usize> = document.match_indices(find).map(|(at, _)| at).collect();
    let quoted = beginning(find);
    match at.as_slice() {
        [start] => {
            let utf16 = |at: usize| document[..at].encode_utf16().count() as u32;
            Ok((utf16(*start), utf16(start + find.len())))
        }
        [] => Err(AppError::new(
            "passage_not_found",
            format!(
                "\"{quoted}\" is not in {name}. Quote the text exactly as read-a-file shows it."
            ),
        )),
        many => Err(AppError::new(
            "passage_not_unique",
            format!(
                "\"{quoted}\" occurs {} times in {name}. Quote more of the passage so it occurs \
                 once.",
                many.len()
            ),
        )),
    }
}

/// The first 40 characters of `text`, for naming a passage in an error.
fn beginning(text: &str) -> String {
    let mut chars = text.chars();
    let start: String = chars.by_ref().take(40).collect();
    if chars.next().is_some() { format!("{start}…") } else { start }
}

/// Stores the suggestion on `start..end`, which reads `base`, after marking the waiting ones it
/// overlaps replaced, in one transaction.
fn insert(
    project: &Project,
    asset_id: Uuid,
    author: &Author,
    (start, end, base): (u32, u32, &str),
    text: &str,
) -> AppResult<Uuid> {
    let id = new_id();
    let state = project.lock();
    let tx = state.conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE suggestions SET state = 'replaced' WHERE asset_id = ?1 AND state = 'waiting' \
         AND passage_start < ?3 AND passage_end > ?2",
        params![asset_id.to_string(), start, end],
    )?;
    tx.execute(
        "INSERT INTO suggestions (id, asset_id, passage_start, passage_end, quote, base, text, \
         author_kind, author_id, state, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, 'waiting', ?9)",
        params![
            id.to_string(),
            asset_id.to_string(),
            start,
            end,
            base,
            text,
            author.kind.as_str(),
            author.id,
            now_ms()
        ],
    )?;
    tx.commit()?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::{temp_project, user};

    const SENTENCE: &str = "Yield fell above 3,800 m in both 2024 and 2025, mainly at Huancayo.";

    fn scribe() -> Author {
        Author { kind: AuthorKind::MiniMe, id: "scribe".into() }
    }

    /// A document reading `text`.
    fn document(project: &Project, text: &str) -> Uuid {
        let report = documents::create(project, "Report", None, &user()).unwrap().id;
        documents::save(project, report, text, &Anchors::default()).unwrap();
        report
    }

    #[test]
    fn a_suggestion_is_refused_without_one_passage_of_a_document() {
        let (_dir, project) = temp_project();
        let report = document(&project, &format!("{SENTENCE} Huancayo again."));
        let csv = assets::import_bytes(&project, "trial.csv", "text/csv", b"a,b", &user()).unwrap();
        let large = "x".repeat(MAX_TEXT_BYTES + 1);
        let refusals = [
            (csv.id, "a,b", "y", "not_a_document"),
            (new_id(), "Yield", "y", "not_a_document"),
            (report, "", "y", "invalid_input"),
            (report, "Yield", large.as_str(), "invalid_input"),
            (report, "Yields", "y", "passage_not_found"),
            (report, "Huancayo", "y", "passage_not_unique"),
        ];
        for (asset, find, text, code) in refusals {
            let refused = add(&project, asset, &scribe(), find, text).unwrap_err();
            assert_eq!(refused.code, code, "{find}");
        }
        assert!(list(&project, report).unwrap().is_empty());
    }

    #[test]
    fn a_new_suggestion_replaces_the_waiting_ones_it_overlaps() {
        let (_dir, project) = temp_project();
        let report = document(&project, SENTENCE);
        let assistant = Author { kind: AuthorKind::MiniMe, id: "assistant".into() };
        let first = add(&project, report, &assistant, "in both 2024 and 2025", "").unwrap();
        let kept = add(&project, report, &scribe(), "Huancayo", "Junín").unwrap();
        let newer = add(&project, report, &scribe(), "3,800 m in both", "3,800 m").unwrap();
        let waiting: Vec<Uuid> = list(&project, report).unwrap().iter().map(|s| s.id).collect();
        assert_eq!(waiting, [kept, newer]);
        let state: String = project
            .lock()
            .conn
            .query_row("SELECT state FROM suggestions WHERE id = ?1", [first.to_string()], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(state, "replaced");
    }

    #[test]
    fn only_a_documents_waiting_suggestions_are_listed() {
        let (_dir, project) = temp_project();
        let report = document(&project, "🥔 Yield fell above 3,800 m.");
        let other = document(&project, "Yield fell.");
        let discarded = add(&project, report, &scribe(), "Yield", "Yields").unwrap();
        discard(&project, discarded).unwrap();
        assert_eq!(discard(&project, discarded).unwrap_err().code, "not_found");
        add(&project, other, &scribe(), "Yield", "Yields").unwrap();
        let id = add(&project, report, &scribe(), "above 3,800 m", "high up").unwrap();

        let listed = list(&project, report).unwrap();
        assert_eq!(listed.len(), 1);
        let suggestion = &listed[0];
        assert_eq!((suggestion.id, suggestion.start, suggestion.end), (id, 14, 27));
        assert_eq!(
            (suggestion.base.as_str(), suggestion.text.as_str()),
            ("above 3,800 m", "high up")
        );
        assert_eq!(suggestion.author, scribe());
    }

    /// Saves `text` as the user would, with the suggestion now on `start..end`.
    fn edit(project: &Project, document: Uuid, id: Uuid, text: &str, (start, end): (u32, u32)) {
        let anchors = Anchors { threads: Vec::new(), suggestions: vec![Anchor { id, start, end }] };
        documents::save(project, document, text, &anchors).unwrap();
    }

    fn utf16_len(text: &str) -> u32 {
        text.encode_utf16().count() as u32
    }

    #[test]
    fn accepting_an_untouched_passage_replaces_it_and_moves_what_follows() {
        let (_dir, project) = temp_project();
        let report = document(&project, &format!("{SENTENCE} Next steps."));
        let shorter = "Yield fell above 3,800 m.";
        let id = add(&project, report, &scribe(), SENTENCE, shorter).unwrap();
        let next = utf16_len(SENTENCE) + 1;
        comments::create(&project, report, (next, next + 10), "Next steps").unwrap();
        let later = add(&project, report, &scribe(), "Next steps.", "Then.").unwrap();

        let accepted = accept(&project, id).unwrap();
        assert_eq!(accepted.text, "Yield fell above 3,800 m. Next steps.");
        assert_eq!(documents::read(&project, report).unwrap(), accepted.text);
        let thread = &accepted.threads[0];
        assert_eq!((thread.start, thread.end, thread.quote.as_str()), (26, 36, "Next steps"));
        let [waiting] = accepted.suggestions.as_slice() else { panic!("expected one suggestion") };
        assert_eq!((waiting.id, waiting.start, waiting.end), (later, 26, 37));
        assert_eq!(accept(&project, id).unwrap_err().code, "not_found");
    }

    #[test]
    fn accepting_after_a_separate_edit_merges_both() {
        let (_dir, project) = temp_project();
        let report = document(&project, SENTENCE);
        let shorter = "Yield fell above 3,800 m, mainly at Huancayo.";
        let id = add(&project, report, &scribe(), SENTENCE, shorter).unwrap();
        let edited = SENTENCE.replace("Huancayo.", "Huancayo and Junín.");
        edit(&project, report, id, &edited, (0, utf16_len(&edited)));
        let accepted = accept(&project, id).unwrap();
        assert_eq!(accepted.text, "Yield fell above 3,800 m, mainly at Huancayo and Junín.");
    }

    #[test]
    fn overlapping_edits_conflict_and_change_nothing() {
        let (_dir, project) = temp_project();
        let report = document(&project, SENTENCE);
        let shorter = "Yield fell above 3,800 m, mainly at Huancayo.";
        let id = add(&project, report, &scribe(), SENTENCE, shorter).unwrap();
        let edited = SENTENCE.replace("in both 2024 and 2025", "in 2024 only");
        edit(&project, report, id, &edited, (0, utf16_len(&edited)));
        assert_eq!(accept(&project, id).unwrap_err().code, "suggestion_conflict");
        assert_eq!(documents::read(&project, report).unwrap(), edited);
        assert_eq!(list(&project, report).unwrap()[0].id, id);
    }

    #[test]
    fn a_detached_suggestion_cannot_be_accepted() {
        let (_dir, project) = temp_project();
        let report = document(&project, SENTENCE);
        let id = add(&project, report, &scribe(), "Huancayo", "Junín").unwrap();
        std::fs::write(assets::file_path(&project, report).unwrap(), "Rewritten.").unwrap();
        assert_eq!(accept(&project, id).unwrap_err().code, "suggestion_detached");
    }
}
