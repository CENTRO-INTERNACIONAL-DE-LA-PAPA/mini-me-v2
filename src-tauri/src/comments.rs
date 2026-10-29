//! Comment threads on the passages of a document. A thread is a Conversation that belongs to a
//! document: its comments and replies are ordinary messages, while its anchor and whether it is
//! resolved are stored beside it in `comment_threads`. Threads are listed only here, never as
//! Conversations.

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::assets;
use crate::conversations;
use crate::documents;
use crate::error::{AppError, AppResult};
use crate::protocol::now_ms;
use crate::store::{Project, ProjectState};

/// A thread as the document view shows it. `start` and `end` are UTF-16 offsets in the
/// document's source; `quote` is the passage's text when the thread was last anchored.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CommentThread {
    pub conversation_id: Uuid,
    pub asset_id: Uuid,
    pub start: u32,
    pub end: u32,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
}

/// Where a thread's passage is now, as the document view tracks it while the user edits.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct Anchor {
    pub thread_id: Uuid,
    pub start: u32,
    pub end: u32,
}

/// The text between the UTF-16 offsets `start` and `end` of `text`; none when they do not mark
/// a passage of it.
pub fn passage(text: &str, start: u32, end: u32) -> Option<String> {
    let units: Vec<u16> = text.encode_utf16().collect();
    let (start, end) = (start as usize, end as usize);
    if start >= end || end > units.len() {
        return None;
    }
    String::from_utf16(&units[start..end]).ok()
}

/// Moves the threads of the document `asset_id` to `anchors` in its saved `text`, each quoting
/// the passage it now marks. An anchor outside the text, or of another document's thread,
/// changes nothing.
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
            "UPDATE comment_threads SET passage_start = ?1, passage_end = ?2, quote = ?3 \
             WHERE conversation_id = ?4 AND asset_id = ?5",
            params![
                anchor.start,
                anchor.end,
                quote,
                anchor.thread_id.to_string(),
                asset_id.to_string()
            ],
        )?;
    }
    Ok(())
}

/// A SQL condition that holds when the Conversation ID in `column` is not a comment thread's.
/// Home reads Projects without upgrading their databases, and one from before comment threads
/// has no `comment_threads` table and no threads.
pub fn not_a_thread(conn: &Connection, column: &str) -> AppResult<String> {
    let has_threads: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' \
         AND name = 'comment_threads')",
        [],
        |row| row.get(0),
    )?;
    Ok(if has_threads {
        format!("{column} NOT IN (SELECT conversation_id FROM comment_threads)")
    } else {
        "1".to_string()
    })
}

/// Whether the Conversation `conversation_id` is a comment thread.
pub fn is_thread(state: &ProjectState, conversation_id: Uuid) -> AppResult<bool> {
    Ok(state.conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM comment_threads WHERE conversation_id = ?1)",
        params![conversation_id.to_string()],
        |row| row.get(0),
    )?)
}

/// Starts a thread on the passage `start..end` of the document `asset_id`, which reads
/// `quote`.
pub fn create(
    project: &Project,
    asset_id: Uuid,
    (start, end): (u32, u32),
    quote: &str,
) -> AppResult<CommentThread> {
    if start >= end || quote.trim().is_empty() {
        return Err(AppError::invalid_input("A comment needs a passage of the document."));
    }
    let state = project.lock();
    let asset = assets::find(&state, asset_id)?;
    if !documents::is_document(&asset.name) {
        return Err(AppError::invalid_input(format!("\"{}\" is not a document.", asset.name)));
    }
    // One transaction, so a thread's Conversation never exists without its row and so never
    // shows up as an ordinary Conversation.
    let tx = state.conn.unchecked_transaction()?;
    let conversation = conversations::insert(&tx)?;
    let thread = CommentThread {
        conversation_id: conversation.id,
        asset_id,
        start,
        end,
        quote: quote.to_string(),
        resolved: false,
        created_at: now_ms(),
    };
    tx.execute(
        "INSERT INTO comment_threads (conversation_id, asset_id, passage_start, passage_end, \
         quote, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            thread.conversation_id.to_string(),
            asset_id.to_string(),
            start,
            end,
            thread.quote,
            thread.created_at
        ],
    )?;
    tx.commit()?;
    Ok(thread)
}

/// The threads of the document `asset_id`, in the order of their passages.
pub fn list(project: &Project, asset_id: Uuid) -> AppResult<Vec<CommentThread>> {
    let state = project.lock();
    let mut stmt = state.conn.prepare(
        "SELECT conversation_id, passage_start, passage_end, quote, resolved, created_at \
         FROM comment_threads WHERE asset_id = ?1 ORDER BY passage_start, created_at",
    )?;
    let rows = stmt.query_map(params![asset_id.to_string()], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, u32>(1)?,
            row.get::<_, u32>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, bool>(4)?,
            row.get::<_, i64>(5)?,
        ))
    })?;
    let mut threads = Vec::new();
    for row in rows {
        let (conversation_id, start, end, quote, resolved, created_at) = row?;
        threads.push(CommentThread {
            conversation_id: Uuid::parse_str(&conversation_id)
                .map_err(|_| AppError::storage("stored ID is not readable"))?,
            asset_id,
            start,
            end,
            quote,
            resolved,
            created_at,
        });
    }
    Ok(threads)
}

#[cfg(test)]
pub mod test_support {
    use super::*;
    use crate::projects::test_support::user;

    /// Makes the existing Conversation `conversation_id` a comment thread on a new document,
    /// so a test can check that a listing skips it.
    pub fn into_thread(project: &Project, conversation_id: Uuid) {
        let document = documents::create(project, "Thread document", None, &user()).unwrap();
        project
            .lock()
            .conn
            .execute(
                "INSERT INTO comment_threads (conversation_id, asset_id, passage_start, \
                 passage_end, quote, created_at) VALUES (?1, ?2, 0, 1, 'x', 0)",
                params![conversation_id.to_string(), document.id.to_string()],
            )
            .unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::{temp_project, user};

    #[test]
    fn a_thread_is_created_on_a_passage_of_a_document_and_listed_in_order() {
        let (_dir, project) = temp_project();
        let report = documents::create(&project, "Report", None, &user()).unwrap();
        let later = create(&project, report.id, (40, 52), "Next steps").unwrap();
        let first = create(&project, report.id, (10, 20), "above 3,800").unwrap();
        let threads = list(&project, report.id).unwrap();
        assert_eq!(threads, [first.clone(), later]);
        assert!(!first.resolved);
        let other = documents::create(&project, "Notes", None, &user()).unwrap();
        assert!(list(&project, other.id).unwrap().is_empty());
    }

    #[test]
    fn saved_anchors_move_their_threads_and_quote_the_new_passage() {
        let (_dir, project) = temp_project();
        let report = documents::create(&project, "Report", None, &user()).unwrap();
        let thread = create(&project, report.id, (0, 5), "Yield").unwrap();
        let text = "Last year, yield fell.";
        let moved = Anchor { thread_id: thread.conversation_id, start: 11, end: 16 };
        let outside = Anchor { thread_id: thread.conversation_id, start: 30, end: 40 };
        documents::save(&project, report.id, text, &[moved, outside]).unwrap();
        let saved = list(&project, report.id).unwrap().remove(0);
        assert_eq!((saved.start, saved.end, saved.quote.as_str()), (11, 16, "yield"));
        assert_eq!(passage("añ🥔b", 2, 4).as_deref(), Some("🥔"));
    }

    #[test]
    fn only_a_passage_of_a_document_can_be_commented() {
        let (_dir, project) = temp_project();
        let csv = assets::import_bytes(&project, "trial.csv", "text/csv", b"a\n", &user()).unwrap();
        let error = create(&project, csv.id, (0, 1), "a").unwrap_err();
        assert_eq!(error.code, "invalid_input");
        let report = documents::create(&project, "Report", None, &user()).unwrap();
        assert!(create(&project, report.id, (5, 5), "").is_err());
    }
}
