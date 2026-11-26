//! Comment threads on a document's passages. A thread is a Conversation whose anchor and resolved
//! state live in `comment_threads`; threads are listed only here, never as Conversations.

use rusqlite::{Connection, params};
use serde::Serialize;
use uuid::Uuid;

use crate::assets;
use crate::conversations;
use crate::documents::{self, Anchor, passage};
use crate::error::{AppError, AppResult};
use crate::link::RunDocument;
use crate::protocol::AssetRef;
use crate::store::{Project, ProjectState, parse_id};

/// `start` and `end` are UTF-16 offsets in the document's source; `quote` is the passage's text
/// when the thread was last anchored.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CommentThread {
    pub conversation_id: Uuid,
    pub asset_id: Uuid,
    pub start: u32,
    pub end: u32,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
    /// Comments and replies together.
    pub comments: u32,
}

/// Moves `asset_id`'s threads to `anchors` in its saved `text`, each quoting its new passage.
/// An anchor outside the text, or of another document's thread, changes nothing.
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
            params![anchor.start, anchor.end, quote, anchor.id.to_string(), asset_id.to_string()],
        )?;
    }
    Ok(())
}

/// A SQL condition that holds when the Conversation ID in `column` is not a comment thread's.
pub fn not_a_thread(column: &str) -> String {
    format!("{column} NOT IN (SELECT conversation_id FROM comment_threads)")
}

pub fn is_thread(state: &ProjectState, conversation_id: Uuid) -> AppResult<bool> {
    Ok(state.conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM comment_threads WHERE conversation_id = ?1)",
        params![conversation_id.to_string()],
        |row| row.get(0),
    )?)
}

/// None for an ordinary Conversation.
pub fn thread_of(state: &ProjectState, conversation_id: Uuid) -> AppResult<Option<CommentThread>> {
    Ok(threads_where(state, "conversation_id = ?1", conversation_id)?.pop())
}

/// None for an ordinary Conversation.
pub fn document_of(state: &ProjectState, conversation_id: Uuid) -> AppResult<Option<AssetRef>> {
    thread_of(state, conversation_id)?.map(|t| assets::find(state, t.asset_id)).transpose()
}

/// The thread's document for a run, with the passage as saved now, or as last quoted when the
/// anchor no longer marks one; none for an ordinary Conversation.
pub fn run_document(project: &Project, conversation_id: Uuid) -> AppResult<Option<RunDocument>> {
    let found = {
        let state = project.lock();
        let Some(thread) = thread_of(&state, conversation_id)? else {
            return Ok(None);
        };
        let document = assets::find(&state, thread.asset_id)?;
        (thread, document)
    };
    let (thread, document) = found;
    let text = documents::read(project, document.id)?;
    let current = passage(&text, thread.start, thread.end).filter(|p| *p == thread.quote);
    let passage = current.unwrap_or(thread.quote);
    Ok(Some(RunDocument { asset_id: document.id, name: document.name, passage }))
}

/// Starts a thread on `start..end` of `asset_id`, which reads `quote`.
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
    let (conversation_id, created_at) = insert_thread(&state, asset_id, (start, end), quote)?;
    Ok(CommentThread {
        conversation_id,
        asset_id,
        start,
        end,
        quote: quote.to_string(),
        resolved: false,
        created_at,
        comments: 0,
    })
}

/// Returns the thread's Conversation and when it was made.
fn insert_thread(
    state: &ProjectState,
    asset_id: Uuid,
    (start, end): (u32, u32),
    quote: &str,
) -> AppResult<(Uuid, i64)> {
    // One transaction, so a thread's Conversation never shows up as an ordinary Conversation.
    let tx = state.conn.unchecked_transaction()?;
    let conversation = conversations::insert(&tx)?;
    tx.execute(
        "INSERT INTO comment_threads (conversation_id, asset_id, passage_start, passage_end, \
         quote, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            conversation.id.to_string(),
            asset_id.to_string(),
            start,
            end,
            quote,
            conversation.created_at
        ],
    )?;
    tx.commit()?;
    Ok((conversation.id, conversation.created_at))
}

/// Resolving hides the thread until "Show resolved".
pub fn set_resolved(project: &Project, conversation_id: Uuid, resolved: bool) -> AppResult<()> {
    let changed = project.lock().conn.execute(
        "UPDATE comment_threads SET resolved = ?1 WHERE conversation_id = ?2",
        params![resolved, conversation_id.to_string()],
    )?;
    if changed == 0 {
        return Err(AppError::not_found("Comment thread not found"));
    }
    Ok(())
}

/// Deletes the thread with its messages in one transaction; files its replies saved
/// stay. A running reply must be stopped first, as `conversations::stop_reply` does.
pub fn delete(project: &Project, conversation_id: Uuid) -> AppResult<()> {
    let state = project.lock();
    if thread_of(&state, conversation_id)?.is_none() {
        return Err(AppError::not_found("Comment thread not found"));
    }
    let messages = "SELECT id FROM messages WHERE conversation_id = ?1";
    let tx = state.conn.unchecked_transaction()?;
    for statement in [
        format!(
            "UPDATE overview SET featured_component = NULL WHERE featured_component IN \
             (SELECT id FROM components WHERE message_id IN ({messages}))"
        ),
        format!("DELETE FROM paused_runs WHERE message_id IN ({messages})"),
        format!("DELETE FROM reactions WHERE message_id IN ({messages})"),
        format!("DELETE FROM message_steps WHERE message_id IN ({messages})"),
        format!("DELETE FROM components WHERE message_id IN ({messages})"),
        "DELETE FROM debug_records WHERE conversation_id = ?1".to_string(),
        "DELETE FROM messages WHERE conversation_id = ?1".to_string(),
        "DELETE FROM events WHERE conversation_id = ?1".to_string(),
        "DELETE FROM comment_threads WHERE conversation_id = ?1".to_string(),
        "DELETE FROM conversations WHERE id = ?1".to_string(),
    ] {
        tx.execute(&statement, params![conversation_id.to_string()])?;
    }
    tx.commit()?;
    Ok(())
}

/// In the order of their passages.
pub fn list(project: &Project, asset_id: Uuid) -> AppResult<Vec<CommentThread>> {
    threads_where(&project.lock(), "asset_id = ?1", asset_id)
}

/// In the order of their passages.
fn threads_where(state: &ProjectState, condition: &str, id: Uuid) -> AppResult<Vec<CommentThread>> {
    let count = "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = t.conversation_id)";
    let mut stmt = state.conn.prepare(&format!(
        "SELECT conversation_id, asset_id, passage_start, passage_end, quote, resolved, \
         created_at, {count} FROM comment_threads t WHERE {condition} \
         ORDER BY passage_start, created_at"
    ))?;
    let rows = stmt.query_map(params![id.to_string()], |row| {
        Ok(ThreadRow {
            conversation_id: row.get(0)?,
            asset_id: row.get(1)?,
            start: row.get(2)?,
            end: row.get(3)?,
            quote: row.get(4)?,
            resolved: row.get(5)?,
            created_at: row.get(6)?,
            comments: row.get(7)?,
        })
    })?;
    let mut threads = Vec::new();
    for row in rows {
        let row = row?;
        threads.push(CommentThread {
            conversation_id: parse_id(&row.conversation_id, "ID")?,
            asset_id: parse_id(&row.asset_id, "ID")?,
            start: row.start,
            end: row.end,
            quote: row.quote,
            resolved: row.resolved,
            created_at: row.created_at,
            comments: row.comments,
        });
    }
    Ok(threads)
}

struct ThreadRow {
    conversation_id: String,
    asset_id: String,
    start: u32,
    end: u32,
    quote: String,
    resolved: bool,
    created_at: i64,
    comments: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::{temp_project, user};
    use crate::protocol::{Author, AuthorKind, new_id};

    #[test]
    fn saved_anchors_move_their_threads_and_quote_the_new_passage() {
        let (_dir, project) = temp_project();
        let report = documents::create(&project, "Report", None, &user()).unwrap();
        let thread = create(&project, report.id, (0, 5), "Yield").unwrap();
        let text = "Last year, yield fell.";
        let moved = Anchor { id: thread.conversation_id, start: 11, end: 16 };
        let outside = Anchor { id: thread.conversation_id, start: 30, end: 40 };
        let anchors = documents::Anchors { threads: vec![moved, outside], suggestions: Vec::new() };
        documents::save(&project, report.id, text, &anchors).unwrap();
        let saved = list(&project, report.id).unwrap().remove(0);
        assert_eq!((saved.start, saved.end, saved.quote.as_str()), (11, 16, "yield"));
        assert_eq!(passage("añ🥔b", 2, 4).as_deref(), Some("🥔"));
    }

    /// A document, a thread on "Huancayo" with one comment, and Scribe's reply; returns the
    /// document, the thread and the reply.
    fn commented(project: &Project) -> (Uuid, CommentThread, Uuid) {
        let text = "Yield fell above 3,800 m, mainly at Huancayo.";
        let document = documents::create(project, "Report", None, &user()).unwrap().id;
        documents::save(project, document, text, &Default::default()).unwrap();
        let thread = create(project, document, (36, 44), "Huancayo").unwrap();
        let input = conversations::SendMessageInput {
            content: "@Scribe shorten this".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let conversation = thread.conversation_id;
        let comment = conversations::send_message(project, conversation, input, new_id()).unwrap();
        let scribe = Author { kind: AuthorKind::MiniMe, id: "scribe".into() };
        let reply = conversations::start_reply(project, conversation, comment.id, scribe).unwrap();
        (document, thread, reply)
    }

    #[test]
    fn a_deleted_thread_keeps_its_files_and_leaves_no_rows() {
        let (_dir, project) = temp_project();
        let (document, thread, reply) = commented(&project);
        let file = ("notes.txt", "", b"x".as_slice());
        let saved = conversations::attach_generated(&project, reply, &user(), file, false).unwrap();
        delete(&project, thread.conversation_id).unwrap();
        assert!(list(&project, document).unwrap().is_empty());
        let state = project.lock();
        for table in ["conversations", "messages", "events", "components"] {
            let count = format!("SELECT COUNT(*) FROM {table}");
            let rows: i64 = state.conn.query_row(&count, [], |row| row.get(0)).unwrap();
            assert_eq!(rows, 0, "{table}");
        }
        assert!(assets::find(&state, saved.id).is_ok());
        drop(state);
        assert_eq!(delete(&project, thread.conversation_id).unwrap_err().code, "not_found");
    }
}
