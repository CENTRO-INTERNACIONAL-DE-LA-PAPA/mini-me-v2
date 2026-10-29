//! Comment threads on the passages of a document. A thread is a Conversation that belongs to a
//! document: its comments and replies are ordinary messages, while its anchor and whether it is
//! resolved are stored beside it in `comment_threads`. Threads are listed only here, never as
//! Conversations.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::assets;
use crate::conversations;
use crate::documents;
use crate::error::{AppError, AppResult};
use crate::link::RunDocument;
use crate::protocol::{AssetRef, Author, AuthorKind, EventKind, now_ms};
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
    /// How many comments and replies the thread holds.
    pub comments: u32,
    /// Its newest suggestion still waiting for an answer.
    pub pending: Option<PendingSuggestion>,
}

/// A suggestion waiting for the user's answer, as the thread view and the source show it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PendingSuggestion {
    pub message_id: Uuid,
    pub component_id: Uuid,
    pub author: Author,
    pub text: String,
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

/// The thread whose Conversation is `conversation_id`; none for an ordinary Conversation.
pub fn thread_of(state: &ProjectState, conversation_id: Uuid) -> AppResult<Option<CommentThread>> {
    Ok(threads_where(state, "conversation_id = ?1", conversation_id)?.pop())
}

/// The document the thread `conversation_id` is about; none for an ordinary Conversation.
pub fn document_of(state: &ProjectState, conversation_id: Uuid) -> AppResult<Option<AssetRef>> {
    thread_of(state, conversation_id)?.map(|t| assets::find(state, t.asset_id)).transpose()
}

/// What a run answering a comment in the thread `conversation_id` is told about its document,
/// with the passage as the saved document reads now, or as last quoted when the thread's
/// anchor no longer marks a passage; none for an ordinary Conversation.
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

/// A `suggestion` component's data as it is stored: the thread's document, the passage as the
/// saved document reads now (the base a later Accept merges from), and the suggested `text`.
/// Fails with `not_in_thread` outside a comment thread.
pub fn suggestion(project: &Project, conversation_id: Uuid, data: &Value) -> AppResult<Value> {
    let text = data["text"]
        .as_str()
        .ok_or_else(|| AppError::new("invalid_component", "A suggestion needs its text."))?;
    let document = run_document(project, conversation_id)?.ok_or_else(|| {
        AppError::new("not_in_thread", "Edits can only be suggested in a comment thread.")
    })?;
    Ok(json!({ "document_id": document.asset_id, "base": document.passage, "text": text }))
}

/// What the user decided about a suggestion, as its component's answer records it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Accepted,
    Rejected,
    Dismissed,
}

/// The document after a suggestion was accepted: its text and its threads, anchored anew.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Accepted {
    pub text: String,
    pub threads: Vec<CommentThread>,
}

/// Records `decision` on the pending suggestion `component_id` of `message_id`, leaving the
/// document as it is. Accepting goes through `accept_suggestion`, which also changes it.
pub fn answer_suggestion(
    project: &Project,
    message_id: Uuid,
    component_id: Uuid,
    decision: Decision,
) -> AppResult<()> {
    let mut state = project.lock();
    let (conversation, _) = pending_suggestion(&state, message_id, component_id)?;
    record(&mut state, conversation, (message_id, component_id), decision)
}

/// Accepts the pending suggestion `component_id` of `message_id`: merges its change into the
/// passage as the user may have edited it since, saves the document with every thread moved to
/// fit, and records the suggestion as accepted. Fails with `suggestion_conflict`, changing
/// nothing, when the user's edits and the suggestion change the same words, and with
/// `suggestion_detached` when the thread's passage can no longer be found.
pub fn accept_suggestion(
    project: &Project,
    message_id: Uuid,
    component_id: Uuid,
) -> AppResult<Accepted> {
    let (conversation, data, thread) = {
        let state = project.lock();
        let (conversation, data) = pending_suggestion(&state, message_id, component_id)?;
        let thread = thread_of(&state, conversation)?
            .ok_or_else(|| AppError::new("not_in_thread", "This suggestion has no thread."))?;
        (conversation, data, thread)
    };
    let text = documents::read(project, thread.asset_id)?;
    let ours = passage(&text, thread.start, thread.end)
        .filter(|p| *p == thread.quote)
        .ok_or_else(|| {
            AppError::new("suggestion_detached", "The passage of this thread can't be found.")
        })?;
    let base = data["base"].as_str().unwrap_or_default();
    let theirs = data["text"].as_str().unwrap_or_default();
    let merged = merge(base, &ours, theirs).ok_or_else(|| {
        AppError::new(
            "suggestion_conflict",
            "You've changed the same words since this was suggested. Try again, or discard it.",
        )
    })?;

    let units: Vec<u16> = text.encode_utf16().collect();
    let (start, end) = (thread.start as usize, thread.end as usize);
    let merged_units: Vec<u16> = merged.encode_utf16().collect();
    let new_units = [&units[..start], &merged_units, &units[end..]].concat();
    let new_text = String::from_utf16_lossy(&new_units);
    // Positions after the passage move by the change in its length; positions inside it keep
    // their place up to the passage's new end.
    let new_end = start + merged_units.len();
    let moved = |at: u32| -> u32 {
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
    let anchors: Vec<Anchor> = list(project, thread.asset_id)?
        .iter()
        .map(|t| Anchor { thread_id: t.conversation_id, start: moved(t.start), end: moved(t.end) })
        .collect();
    documents::save(project, thread.asset_id, &new_text, &anchors)?;
    record(&mut project.lock(), conversation, (message_id, component_id), Decision::Accepted)?;
    Ok(Accepted { text: new_text, threads: list(project, thread.asset_id)? })
}

/// The thread's Conversation and the data of the suggestion `component_id`, which must still
/// wait for an answer.
fn pending_suggestion(
    state: &ProjectState,
    message_id: Uuid,
    component_id: Uuid,
) -> AppResult<(Uuid, Value)> {
    let (conversation, _) = state
        .message_place(message_id)?
        .ok_or_else(|| AppError::not_found("Message not found"))?;
    let component = state
        .conversation_component(conversation, component_id)?
        .filter(|c| c.kind == "suggestion")
        .ok_or_else(|| AppError::not_found("No such suggestion in this thread."))?;
    if !component.answer.is_null() {
        return Err(AppError::new("not_pending", "This suggestion has already been answered."));
    }
    Ok((conversation, component.data))
}

fn record(
    state: &mut ProjectState,
    conversation: Uuid,
    (message_id, component_id): (Uuid, Uuid),
    decision: Decision,
) -> AppResult<()> {
    let answer = json!({ "decision": decision });
    state.persist(conversation, EventKind::ComponentAnswered { message_id, component_id, answer })?;
    Ok(())
}

/// Stands in for a newline while text is split one word per line for `diffy`, which merges
/// line by line.
const NEWLINE: char = '\u{E000}';

/// `ours` with the change from `base` to `theirs` applied word by word; none when the two
/// change the same words.
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
        comments: 0,
        pending: None,
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

/// Resolves the thread `conversation_id`, which hides it until "Show resolved", or reopens it.
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

/// Deletes the thread `conversation_id` with its comments, replies and their suggestions, in
/// one transaction. Files its replies saved stay in the Project. A running reply must be
/// stopped first, as `conversations::stop_reply` does.
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

/// The threads of the document `asset_id`, in the order of their passages.
pub fn list(project: &Project, asset_id: Uuid) -> AppResult<Vec<CommentThread>> {
    threads_where(&project.lock(), "asset_id = ?1", asset_id)
}

/// The threads matching `condition` on the ID `id`, in the order of their passages.
fn threads_where(state: &ProjectState, condition: &str, id: Uuid) -> AppResult<Vec<CommentThread>> {
    let count = "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = t.conversation_id)";
    let mut stmt = state.conn.prepare(&format!(
        "SELECT conversation_id, asset_id, passage_start, passage_end, quote, resolved, \
         created_at, {count} FROM comment_threads t WHERE {condition} \
         ORDER BY passage_start, created_at"
    ))?;
    let rows = stmt.query_map(params![id.to_string()], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, u32>(2)?,
            row.get::<_, u32>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, bool>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, u32>(7)?,
        ))
    })?;
    let corrupt = || AppError::storage("stored ID is not readable");
    let mut threads = Vec::new();
    for row in rows {
        let (conversation_id, asset_id, start, end, quote, resolved, created_at, comments) = row?;
        threads.push(CommentThread {
            conversation_id: Uuid::parse_str(&conversation_id).map_err(|_| corrupt())?,
            asset_id: Uuid::parse_str(&asset_id).map_err(|_| corrupt())?,
            start,
            end,
            quote,
            resolved,
            created_at,
            comments,
            pending: None,
        });
    }
    for thread in &mut threads {
        thread.pending = pending(state, thread.conversation_id)?;
    }
    Ok(threads)
}

/// The newest suggestion in the thread `conversation_id` still waiting for an answer.
fn pending(state: &ProjectState, conversation_id: Uuid) -> AppResult<Option<PendingSuggestion>> {
    let row = state
        .conn
        .query_row(
            "SELECT c.id, c.message_id, c.data, m.author_kind, m.author_id FROM components c \
             JOIN messages m ON m.id = c.message_id WHERE m.conversation_id = ?1 \
             AND c.kind = 'suggestion' AND c.answer IS NULL ORDER BY c.rowid DESC LIMIT 1",
            params![conversation_id.to_string()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()?;
    let Some((component_id, message_id, data, kind, author_id)) = row else {
        return Ok(None);
    };
    let corrupt = || AppError::storage("stored suggestion is not readable");
    let data: Value = serde_json::from_str(&data)?;
    Ok(Some(PendingSuggestion {
        message_id: Uuid::parse_str(&message_id).map_err(|_| corrupt())?,
        component_id: Uuid::parse_str(&component_id).map_err(|_| corrupt())?,
        author: Author { kind: AuthorKind::parse(&kind).ok_or_else(corrupt)?, id: author_id },
        text: data["text"].as_str().unwrap_or_default().to_string(),
    }))
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
    use crate::protocol::new_id;

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
    fn a_run_in_a_thread_gets_its_document_and_passage() {
        let (_dir, project) = temp_project();
        let report = documents::create(&project, "Report", None, &user()).unwrap();
        documents::save(&project, report.id, "Yield fell above 3,800 m.", &[]).unwrap();
        let thread = create(&project, report.id, (11, 24), "above 3,800 m").unwrap();
        let document = run_document(&project, thread.conversation_id).unwrap().unwrap();
        assert_eq!(document.name, "Report.qmd");
        assert_eq!(document.passage, "above 3,800 m");

        // Edited outside Mini-Me, so the anchor no longer marks the passage: its quote is used.
        let path = assets::file_path(&project, report.id).unwrap();
        std::fs::write(path, "Yields fell.").unwrap();
        let document = run_document(&project, thread.conversation_id).unwrap().unwrap();
        assert_eq!(document.passage, "above 3,800 m");

        let conversation = conversations::create(&project).unwrap().id;
        assert!(run_document(&project, conversation).unwrap().is_none());
    }

    #[test]
    fn a_suggestion_is_completed_with_its_document_and_base() {
        let (_dir, project) = temp_project();
        let report = documents::create(&project, "Report", None, &user()).unwrap();
        documents::save(&project, report.id, "Yield fell above 3,800 m.", &[]).unwrap();
        let thread = create(&project, report.id, (0, 10), "Yield fell").unwrap();
        let data = json!({ "text": "Yields fell" });
        let stored = suggestion(&project, thread.conversation_id, &data).unwrap();
        assert_eq!(
            stored,
            json!({ "document_id": report.id, "base": "Yield fell", "text": "Yields fell" })
        );

        let conversation = conversations::create(&project).unwrap().id;
        let refused = suggestion(&project, conversation, &json!({ "text": "x" })).unwrap_err();
        assert_eq!(refused.code, "not_in_thread");
    }

    const SENTENCE: &str = "Yield fell above 3,800 m in both 2024 and 2025, mainly at Huancayo.";

    /// A document reading `text`, a thread on `quote` in it, and a reply in the thread
    /// suggesting `suggested` for it; returns the document, the thread and the suggestion's
    /// `(message, component)`.
    fn suggested(
        project: &Project,
        text: &str,
        quote: &str,
        suggested: &str,
    ) -> (Uuid, CommentThread, (Uuid, Uuid)) {
        let document = documents::create(project, "Report", None, &user()).unwrap().id;
        documents::save(project, document, text, &[]).unwrap();
        let start = text[..text.find(quote).unwrap()].encode_utf16().count() as u32;
        let end = start + quote.encode_utf16().count() as u32;
        let thread = create(project, document, (start, end), quote).unwrap();
        let input = conversations::SendMessageInput {
            content: "@Scribe shorten this".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let comment =
            conversations::send_message(project, thread.conversation_id, input, new_id()).unwrap();
        let scribe = Author { kind: AuthorKind::MiniMe, id: "scribe".into() };
        let conversation = thread.conversation_id;
        let reply = conversations::start_reply(project, conversation, comment.id, scribe).unwrap();
        let data = suggestion(project, thread.conversation_id, &json!({ "text": suggested }));
        let component = ("suggestion", 1, data.unwrap(), suggested.to_string());
        let component = conversations::add_component(project, reply, None, component).unwrap();
        (document, thread, (reply, component))
    }

    /// Saves `text` as the user would, with the thread now on `start..end`.
    fn edit(project: &Project, document: Uuid, thread: &CommentThread, text: &str, end: u32) {
        let anchor = Anchor { thread_id: thread.conversation_id, start: thread.start, end };
        documents::save(project, document, text, &[anchor]).unwrap();
    }

    fn decision(project: &Project, (message, component): (Uuid, Uuid)) -> Value {
        let (conversation, _) = project.lock().message_place(message).unwrap().unwrap();
        let state = project.lock();
        state.conversation_component(conversation, component).unwrap().unwrap().answer
    }

    #[test]
    fn accepting_an_untouched_passage_replaces_it_and_moves_the_threads_after_it() {
        let (_dir, project) = temp_project();
        let text = format!("{SENTENCE} Next steps.");
        let shorter = "Yield fell above 3,800 m.";
        let (document, _, answer) = suggested(&project, &text, SENTENCE, shorter);
        let next = text.find("Next steps").unwrap() as u32;
        create(&project, document, (next, next + 10), "Next steps").unwrap();
        let accepted = accept_suggestion(&project, answer.0, answer.1).unwrap();
        assert_eq!(accepted.text, "Yield fell above 3,800 m. Next steps.");
        assert_eq!(documents::read(&project, document).unwrap(), accepted.text);
        let anchors: Vec<(u32, u32, &str)> =
            accepted.threads.iter().map(|t| (t.start, t.end, t.quote.as_str())).collect();
        assert_eq!(anchors, [(0, 25, shorter), (26, 36, "Next steps")]);
        assert_eq!(decision(&project, answer), json!({ "decision": "accepted" }));
        let again = accept_suggestion(&project, answer.0, answer.1).unwrap_err();
        assert_eq!(again.code, "not_pending");
    }

    #[test]
    fn accepting_after_a_separate_edit_merges_both() {
        let (_dir, project) = temp_project();
        let shorter = "Yield fell above 3,800 m, mainly at Huancayo.";
        let (document, thread, answer) = suggested(&project, SENTENCE, SENTENCE, shorter);
        let edited = SENTENCE.replace("Huancayo.", "Huancayo and Junín.");
        edit(&project, document, &thread, &edited, edited.encode_utf16().count() as u32);
        let accepted = accept_suggestion(&project, answer.0, answer.1).unwrap();
        assert_eq!(accepted.text, "Yield fell above 3,800 m, mainly at Huancayo and Junín.");
    }

    #[test]
    fn overlapping_edits_conflict_and_change_nothing() {
        let (_dir, project) = temp_project();
        let shorter = "Yield fell above 3,800 m, mainly at Huancayo.";
        let (document, thread, answer) = suggested(&project, SENTENCE, SENTENCE, shorter);
        let edited = SENTENCE.replace("in both 2024 and 2025", "in 2024 only");
        edit(&project, document, &thread, &edited, edited.encode_utf16().count() as u32);
        let error = accept_suggestion(&project, answer.0, answer.1).unwrap_err();
        assert_eq!(error.code, "suggestion_conflict");
        assert_eq!(documents::read(&project, document).unwrap(), edited);
        assert!(decision(&project, answer).is_null());

        answer_suggestion(&project, answer.0, answer.1, Decision::Dismissed).unwrap();
        assert_eq!(decision(&project, answer), json!({ "decision": "dismissed" }));
    }

    #[test]
    fn a_detached_thread_cannot_accept() {
        let (_dir, project) = temp_project();
        let (document, _, answer) = suggested(&project, SENTENCE, "Huancayo", "Junín");
        std::fs::write(assets::file_path(&project, document).unwrap(), "Rewritten.").unwrap();
        let error = accept_suggestion(&project, answer.0, answer.1).unwrap_err();
        assert_eq!(error.code, "suggestion_detached");
    }

    #[test]
    fn a_resolved_thread_can_be_reopened_and_a_deleted_one_leaves_no_rows() {
        let (_dir, project) = temp_project();
        let (document, thread, (reply, _)) = suggested(&project, SENTENCE, "Huancayo", "Junín");
        set_resolved(&project, thread.conversation_id, true).unwrap();
        assert!(list(&project, document).unwrap()[0].resolved);
        set_resolved(&project, thread.conversation_id, false).unwrap();
        assert!(!list(&project, document).unwrap()[0].resolved);

        let file = ("notes.txt", "", b"x".as_slice());
        let saved = conversations::attach_generated(&project, reply, &user(), file).unwrap();
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

    #[test]
    fn a_listed_thread_shows_its_count_and_pending_suggestion() {
        let (_dir, project) = temp_project();
        let (document, _, answer) = suggested(&project, SENTENCE, "Huancayo", "Junín");
        let thread = list(&project, document).unwrap().remove(0);
        assert_eq!(thread.comments, 2);
        let pending = thread.pending.unwrap();
        assert_eq!((pending.component_id, pending.text.as_str()), (answer.1, "Junín"));

        answer_suggestion(&project, answer.0, answer.1, Decision::Rejected).unwrap();
        assert!(list(&project, document).unwrap()[0].pending.is_none());
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
