//! Conversations and the message lifecycle. Every message change goes through
//! `ProjectState::persist`, so it is stored as an event before anyone sees it.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::approvals;
use crate::assets;
use crate::comments;
use crate::components;
use crate::error::{AppError, AppResult};
use crate::link::{RunFile, RunMiniMe};
use crate::protocol::{
    AssetRef, Author, AuthorKind, Component, ErrorInfo, EventKind, Message, MessageStatus,
    TextComponent, TextComponentKind, new_id, now_ms,
};
use crate::store::{MessageAt, Project, ProjectState, parse_id};

pub const DEFAULT_TITLE: &str = "New conversation";
const MAX_EMOJI_CHARS: usize = 16;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConversationSummary {
    pub id: Uuid,
    pub title: String,
    pub created_at: i64,
    pub last_activity_at: i64,
    pub status: Option<ConversationStatus>,
}

/// What the latest reply is doing, and which Mini-Me; only running or paused replies have one.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConversationStatus {
    Running { mini_me: RunMiniMe },
    NeedsApproval { mini_me: RunMiniMe },
}

#[derive(Debug, Clone, Deserialize)]
pub struct SendMessageInput {
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<Uuid>,
    #[serde(default)]
    pub text_components: Vec<TextComponent>,
}

pub fn create(project: &Project) -> AppResult<ConversationSummary> {
    insert(&project.lock().conn)
}

/// `conn` may be inside a transaction.
pub fn insert(conn: &Connection) -> AppResult<ConversationSummary> {
    let now = now_ms();
    let summary = ConversationSummary {
        id: new_id(),
        title: DEFAULT_TITLE.to_string(),
        created_at: now,
        last_activity_at: now,
        status: None,
    };
    conn.execute(
        "INSERT INTO conversations (id, title, created_at, last_activity_at) \
         VALUES (?1, ?2, ?3, ?4)",
        params![summary.id.to_string(), summary.title, now, now],
    )?;
    Ok(summary)
}

pub fn title(project: &Project, conversation_id: Uuid) -> AppResult<String> {
    let state = project.lock();
    Ok(state.conn.query_row(
        "SELECT title FROM conversations WHERE id = ?1",
        params![conversation_id.to_string()],
        |row| row.get(0),
    )?)
}

/// Trims `title`; fails when it is empty.
pub fn rename(project: &Project, conversation_id: Uuid, title: &str) -> AppResult<()> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid_input("A Conversation needs a title."));
    }
    let state = project.lock();
    state.require_conversation(conversation_id)?;
    state.conn.execute(
        "UPDATE conversations SET title = ?1 WHERE id = ?2",
        params![title, conversation_id.to_string()],
    )?;
    Ok(())
}

/// Deletes all its rows in one transaction; saved files stay. Stop its running reply first.
pub fn delete(project: &Project, conversation_id: Uuid) -> AppResult<()> {
    let state = project.lock();
    state.require_conversation(conversation_id)?;
    let id = conversation_id.to_string();
    let messages = "SELECT id FROM messages WHERE conversation_id = ?1";
    let tx = state.conn.unchecked_transaction()?;
    let statements = [
        format!(
            "UPDATE overview SET featured_component = NULL WHERE featured_component IN \
             (SELECT id FROM components WHERE message_id IN ({messages}))"
        ),
        format!("DELETE FROM paused_runs WHERE message_id IN ({messages})"),
        format!("DELETE FROM reactions WHERE message_id IN ({messages})"),
        format!("DELETE FROM components WHERE message_id IN ({messages})"),
        format!("DELETE FROM message_steps WHERE message_id IN ({messages})"),
        "DELETE FROM debug_records WHERE conversation_id = ?1".to_string(),
        "DELETE FROM messages WHERE conversation_id = ?1".to_string(),
        "DELETE FROM events WHERE conversation_id = ?1".to_string(),
        "DELETE FROM comment_threads WHERE conversation_id = ?1".to_string(),
        "DELETE FROM conversations WHERE id = ?1".to_string(),
    ];
    for statement in &statements {
        tx.execute(statement, params![id])?;
    }
    tx.commit()?;
    Ok(())
}

/// The sole user message (first 2000 chars) while the title is the default, so it is named once.
pub fn first_message_to_name(project: &Project, conversation_id: Uuid) -> AppResult<Option<String>> {
    let state = project.lock();
    state.require_conversation(conversation_id)?;
    let id = conversation_id.to_string();
    let title: String =
        state.conn.query_row("SELECT title FROM conversations WHERE id = ?1", params![id], |r| r.get(0))?;
    if title != DEFAULT_TITLE {
        return Ok(None);
    }
    let mut stmt = state.conn.prepare(
        "SELECT content FROM messages WHERE conversation_id = ?1 AND author_kind = 'user' \
         ORDER BY created_at, rowid LIMIT 2",
    )?;
    let contents: Vec<String> = stmt.query_map(params![id], |r| r.get(0))?.collect::<Result<_, _>>()?;
    Ok(match contents.as_slice() {
        [only] => Some(only.chars().take(2000).collect()),
        _ => None,
    })
}

/// Only replaces the default title, keeping one the user set meanwhile; returns whether it did.
pub fn set_title_if_default(project: &Project, conversation_id: Uuid, title: &str) -> AppResult<bool> {
    let title = title.trim();
    if title.is_empty() {
        return Ok(false);
    }
    let changed = project.lock().conn.execute(
        "UPDATE conversations SET title = ?1 WHERE id = ?2 AND title = ?3",
        params![title, conversation_id.to_string(), DEFAULT_TITLE],
    )?;
    Ok(changed > 0)
}

/// Conversations ordered by most recent activity first.
pub fn list(project: &Project) -> AppResult<Vec<ConversationSummary>> {
    let state = project.lock();
    let mut stmt = state.conn.prepare(&format!(
        "SELECT id, title, created_at, last_activity_at FROM conversations WHERE {} \
         ORDER BY last_activity_at DESC, created_at DESC",
        comments::not_a_thread("id")
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    let paused = approvals::paused_mini_mes(&state.conn)?;
    let mut conversations = Vec::new();
    for row in rows {
        let (id, title, created_at, last_activity_at) = row?;
        let id = parse_id(&id, "ID")?;
        conversations.push(ConversationSummary {
            id,
            title,
            created_at,
            last_activity_at,
            status: paused
                .get(&id)
                .map(|mini_me| ConversationStatus::NeedsApproval { mini_me: mini_me.clone() }),
        });
    }
    Ok(conversations)
}

fn validate_text_components(
    state: &ProjectState,
    content: &str,
    components: &[TextComponent],
) -> AppResult<()> {
    let length = content.encode_utf16().count() as u32;
    for component in components {
        if component.start >= component.end || component.end > length {
            return Err(AppError::invalid_input(
                "A reference points outside the message text.",
            ));
        }
        if component.label.trim().is_empty() {
            return Err(AppError::invalid_input("A reference has no label."));
        }
        match component.kind {
            TextComponentKind::Asset => {
                assets::find(state, component.id)?;
            }
            // Mini-Mes are not Project data; `routing::send` checks mentions against the
            // library before the message gets here.
            TextComponentKind::MiniMe => {}
        }
    }
    Ok(())
}

/// Fails with `reply_in_progress` while a reply in the Conversation is streaming or paused.
pub fn send_message(
    project: &Project,
    conversation_id: Uuid,
    input: SendMessageInput,
    user_id: Uuid,
) -> AppResult<Message> {
    if input.content.trim().is_empty() {
        return Err(AppError::invalid_input("A message cannot be empty."));
    }
    let mut state = project.lock();
    state.require_conversation(conversation_id)?;
    let in_progress = [MessageStatus::Streaming, MessageStatus::Paused];
    if !state.messages_with_status(&in_progress, Some(conversation_id))?.is_empty() {
        return Err(AppError::new(
            "reply_in_progress",
            "Wait for the current reply to finish, or stop it, before sending another message.",
        ));
    }
    let attachments = input
        .attachments
        .iter()
        .map(|id| assets::find(&state, *id))
        .collect::<AppResult<Vec<_>>>()?;
    validate_text_components(&state, &input.content, &input.text_components)?;

    let author = Author { kind: AuthorKind::User, id: user_id.to_string() };
    let message = Message {
        attachments,
        text_components: input.text_components,
        ..Message::new(author, input.content, MessageStatus::Complete, None)
    };
    state.persist(
        conversation_id,
        EventKind::MessageCreated {
            message: message.clone(),
        },
    )?;
    Ok(message)
}

/// Stores `kind` as an event of the reply `message_id`, which must still be streaming.
fn reply_event(project: &Project, message_id: Uuid, kind: EventKind) -> AppResult<()> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    state.persist(conversation, kind)?;
    Ok(())
}

/// The reply's Conversation; `reply_finished` unless the reply is still streaming.
fn streaming_reply(state: &ProjectState, message_id: Uuid) -> AppResult<Uuid> {
    match state.message_place(message_id)? {
        Some((conversation, MessageStatus::Streaming)) => Ok(conversation),
        Some(_) => Err(AppError::new("reply_finished", "This reply has already finished.")),
        None => Err(AppError::not_found("Message not found")),
    }
}

/// Starts a reply to `reply_to`: an empty message with status `streaming`.
pub fn start_reply(
    project: &Project,
    conversation_id: Uuid,
    reply_to: Uuid,
    author: Author,
) -> AppResult<Uuid> {
    let message = Message::new(author, String::new(), MessageStatus::Streaming, Some(reply_to));
    let id = message.id;
    project
        .lock()
        .persist(conversation_id, EventKind::MessageCreated { message })?;
    Ok(id)
}

pub fn append_delta(project: &Project, message_id: Uuid, text: &str) -> AppResult<()> {
    reply_event(project, message_id, EventKind::MessageDelta { message_id, text: text.to_string() })
}

/// Records that a Step of a streaming reply's Workflow started.
pub fn append_step_started(
    project: &Project,
    message_id: Uuid,
    step_id: &str,
    step_type: &str,
    name: &str,
    show_results: bool,
) -> AppResult<()> {
    let kind = EventKind::StepStarted {
        message_id,
        step_id: step_id.to_string(),
        step_type: step_type.to_string(),
        name: name.to_string(),
        show_results,
    };
    reply_event(project, message_id, kind)
}

pub fn append_step_completed(
    project: &Project,
    message_id: Uuid,
    step_id: &str,
    output: Option<String>,
) -> AppResult<()> {
    let kind = EventKind::StepCompleted { message_id, step_id: step_id.to_string(), output };
    reply_event(project, message_id, kind)
}

/// A component a reply adds; its ID, answer and Step are set when it is added.
pub struct NewComponent {
    pub kind: String,
    pub version: u32,
    pub preview: serde_json::Value,
    pub text: String,
    pub source_asset_id: Option<Uuid>,
}

/// Returns the new ID; the component records the latest run of `step_id`, the Step that added it.
pub fn add_component(
    project: &Project,
    message_id: Uuid,
    step_id: Option<&str>,
    component: NewComponent,
) -> AppResult<Uuid> {
    let NewComponent {
        kind,
        preview,
        text,
        source_asset_id,
        ..
    } = &component;
    components::check(&project.lock(), kind, (preview, text), *source_asset_id)?;
    add_core_component(project, message_id, step_id, component)
}

/// For kinds `add_component` refuses from a Trait; returns the new ID.
pub fn add_core_component(
    project: &Project,
    message_id: Uuid,
    step_id: Option<&str>,
    NewComponent {
        kind,
        version,
        preview,
        text,
        source_asset_id,
    }: NewComponent,
) -> AppResult<Uuid> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    let step_index = match step_id {
        Some(step_id) => state.latest_step_index(message_id, step_id)?,
        None => None,
    };
    let component = Component {
        id: new_id(),
        kind,
        version,
        preview,
        text,
        source_asset_id,
        answer: serde_json::Value::Null,
        step_index,
    };
    let id = component.id;
    state.persist(conversation, EventKind::ComponentAdded { message_id, component })?;
    Ok(id)
}

/// Stores a Trait's file as a generated Asset and attaches it unless `hidden`; removed if the
/// reply ends first.
pub fn attach_generated(
    project: &Project,
    message_id: Uuid,
    author: &Author,
    (name, media_type, bytes): (&str, &str, &[u8]),
    hidden: bool,
) -> AppResult<AssetRef> {
    streaming_reply(&project.lock(), message_id)?;
    let asset = assets::write_generated(project, name, media_type, bytes, author, hidden)?;
    let attached = {
        let mut state = project.lock();
        streaming_reply(&state, message_id).and_then(|conversation| {
            if hidden {
                return Ok(());
            }
            let event = EventKind::AttachmentAdded { message_id, asset: asset.clone() };
            state.persist(conversation, event).map(|_| ())
        })
    };
    if let Err(err) = attached {
        let _ = assets::remove(project, asset.id);
        return Err(err);
    }
    Ok(asset)
}

pub fn complete_reply(project: &Project, message_id: Uuid) -> AppResult<Message> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    let mut message = state
        .load_message_with(message_id, false)?
        .map(|(_, message)| message)
        .ok_or_else(|| AppError::not_found("Reply not found"))?;
    let content = message.content.clone();
    state.persist(conversation, EventKind::MessageCompleted { message_id, content })?;
    message.status = MessageStatus::Complete;
    Ok(message)
}

pub fn fail_reply(project: &Project, message_id: Uuid, code: &str, message: &str) -> AppResult<()> {
    let mut state = project.lock();
    fail_locked(&mut state, message_id, code, message)
}

fn fail_locked(state: &mut ProjectState, message_id: Uuid, code: &str, message: &str) -> AppResult<()> {
    let conversation = streaming_reply(state, message_id)?;
    state.persist(
        conversation,
        EventKind::MessageFailed {
            message_id,
            error: ErrorInfo {
                code: code.to_string(),
                message: message.to_string(),
            },
        },
    )?;
    Ok(())
}

pub fn append_progress(
    project: &Project,
    message_id: Uuid,
    label: &str,
    fraction: Option<f64>,
) -> AppResult<()> {
    let kind = EventKind::MessageProgress {
        message_id,
        label: label.to_string(),
        fraction: fraction.map(|f| f.clamp(0.0, 1.0)),
    };
    reply_event(project, message_id, kind)
}

/// A reply that has already ended is left as it is.
pub fn cancel_reply(project: &Project, message_id: Uuid) -> AppResult<()> {
    reply_event(project, message_id, EventKind::MessageCancelled { message_id })
}

/// Returns the stopped IDs; later producer updates are rejected, and a paused run is deleted.
pub fn stop_reply(project: &Project, conversation_id: Uuid) -> AppResult<Vec<Uuid>> {
    let mut state = project.lock();
    state.require_conversation(conversation_id)?;
    let in_progress = [MessageStatus::Streaming, MessageStatus::Paused];
    let mut stopped = Vec::new();
    let replies = state.messages_with_status(&in_progress, Some(conversation_id))?;
    for MessageAt { message: message_id, .. } in replies {
        let kinds = vec![EventKind::MessageCancelled { message_id }];
        state.persist_all(conversation_id, kinds, |tx| {
            tx.execute("DELETE FROM paused_runs WHERE message_id = ?1", params![message_id.to_string()])?;
            Ok(())
        })?;
        stopped.push(message_id);
    }
    Ok(stopped)
}

/// What a paused reply needs to resume; `state` is the sidecar's opaque resume state.
#[derive(Debug, Clone, PartialEq)]
pub struct PausedRun {
    pub message_id: Uuid,
    pub step_id: String,
    pub component_id: Uuid,
    pub run: serde_json::Value,
    pub output: Option<String>,
    pub state: String,
}

#[derive(Debug)]
pub struct Answered {
    pub paused: PausedRun,
    pub output: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Answer {
    Approved { approved: bool },
    Written { text: String },
    Skipped { skipped: bool },
}

impl Answer {
    pub fn resumes(&self) -> bool {
        !matches!(self, Answer::Approved { approved: false })
    }

    fn text(&self) -> Option<&str> {
        match self {
            Answer::Written { text } => Some(text.trim()),
            _ => None,
        }
    }

    fn check(&self, written: bool) -> AppResult<()> {
        let fits = match self {
            Answer::Approved { .. } => !written,
            Answer::Written { text } => written && !text.trim().is_empty(),
            Answer::Skipped { skipped } => written && *skipped,
        };
        if fits {
            Ok(())
        } else {
            Err(AppError::new("invalid_answer", "This answer doesn't fit the question asked."))
        }
    }

    fn stored(&self) -> serde_json::Value {
        match self {
            Answer::Approved { approved } => serde_json::json!({ "approved": approved }),
            Answer::Written { .. } => serde_json::json!({ "text": self.text() }),
            Answer::Skipped { .. } => serde_json::json!({ "skipped": true }),
        }
    }
}

/// Adds the `approval` component, saves `paused` and persists `message.paused` in one transaction.
pub fn pause_reply(
    project: &Project,
    paused: PausedRun,
    prompt: &str,
    written: bool,
) -> AppResult<()> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, paused.message_id)?;
    let message_id = paused.message_id;
    let component = Component {
        id: paused.component_id,
        kind: "approval".to_string(),
        version: 1,
        preview: if written {
            serde_json::json!({ "step_id": paused.step_id, "prompt": prompt, "answer": "text" })
        } else {
            serde_json::json!({ "step_id": paused.step_id, "prompt": prompt })
        },
        text: prompt.to_string(),
        source_asset_id: None,
        answer: serde_json::Value::Null,
        step_index: None,
    };
    let kinds = vec![
        EventKind::ComponentAdded { message_id, component },
        EventKind::MessagePaused { message_id },
    ];
    state.persist_all(conversation, kinds, |tx| {
        tx.execute(
            "INSERT INTO paused_runs (message_id, step_id, component_id, run, output, state, \
             created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                message_id.to_string(),
                paused.step_id,
                paused.component_id.to_string(),
                serde_json::to_string(&paused.run)?,
                paused.output,
                paused.state,
                now_ms()
            ],
        )?;
        Ok(())
    })?;
    Ok(())
}

/// `not_paused` unless the reply waits for the approval `component_id`.
pub fn paused_run(project: &Project, message_id: Uuid, component_id: Uuid) -> AppResult<PausedRun> {
    let state = project.lock();
    paused_locked(&state, message_id, component_id).map(|(_, paused)| paused)
}

fn paused_locked(
    state: &ProjectState,
    message_id: Uuid,
    component_id: Uuid,
) -> AppResult<(Uuid, PausedRun)> {
    let not_paused = || AppError::new("not_paused", "This reply is not waiting for that answer.");
    let conversation = match state.message_place(message_id)? {
        Some((conversation, MessageStatus::Paused)) => conversation,
        _ => return Err(not_paused()),
    };
    let row = state
        .conn
        .query_row(
            "SELECT step_id, component_id, run, output, state FROM paused_runs \
             WHERE message_id = ?1",
            params![message_id.to_string()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()?;
    let Some((step_id, stored_component, run, output, saved)) = row else {
        return Err(not_paused());
    };
    if stored_component != component_id.to_string() {
        return Err(not_paused());
    }
    let paused = PausedRun {
        message_id,
        step_id,
        component_id,
        run: serde_json::from_str(&run)?,
        output,
        state: saved,
    };
    Ok((conversation, paused))
}

/// Rejecting completes the reply as is; every other answer resumes it. Deletes and returns the
/// saved run.
pub fn answer_approval(
    project: &Project,
    message_id: Uuid,
    component_id: Uuid,
    answer: &Answer,
) -> AppResult<Answered> {
    let mut state = project.lock();
    let (conversation, paused) = paused_locked(&state, message_id, component_id)?;
    let approval = state
        .load_message_with(message_id, true)?
        .and_then(|(_, message)| message.components.into_iter().find(|c| c.id == component_id));
    answer.check(approval.as_ref().is_some_and(|c| c.preview["answer"] == "text"))?;
    let output = answer.text().map(|text| {
        let questions = approval.as_ref().map_or("", |c| c.text.as_str());
        format!("I asked:\n{questions}\n\nThe user answered:\n{text}")
    });
    let mut kinds = vec![
        EventKind::ComponentAnswered { message_id, component_id, answer: answer.stored() },
        EventKind::StepCompleted {
            message_id,
            step_id: paused.step_id.clone(),
            output: output.clone(),
        },
    ];
    if answer.resumes() {
        kinds.push(EventKind::MessageResumed { message_id });
    } else {
        let content = match &paused.output {
            Some(output) => output.clone(),
            None => state
                .load_message_with(message_id, false)?
                .map(|(_, message)| message.content)
                .unwrap_or_default(),
        };
        kinds.push(EventKind::MessageCompleted { message_id, content });
    }
    state.persist_all(conversation, kinds, |tx| {
        tx.execute("DELETE FROM paused_runs WHERE message_id = ?1", params![message_id.to_string()])?;
        Ok(())
    })?;
    Ok(Answered { paused, output })
}

/// Attached and referenced file names, without duplicates.
pub fn file_names(message: &Message) -> Vec<String> {
    message_files(message).into_iter().map(|f| f.name).collect()
}

/// The files a message attaches, then those it references, each once.
pub fn message_files(message: &Message) -> Vec<RunFile> {
    let mut files: Vec<RunFile> = message
        .attachments
        .iter()
        .map(|a| RunFile { asset_id: a.id, name: a.name.clone() })
        .collect();
    for component in &message.text_components {
        if component.kind == TextComponentKind::Asset {
            let name = component.label.trim_start_matches('#').to_string();
            if !files.iter().any(|f| f.name == name) {
                files.push(RunFile { asset_id: component.id, name });
            }
        }
    }
    files
}

/// A reply the app writes itself, complete from the start.
pub fn system_reply(
    project: &Project,
    conversation_id: Uuid,
    reply_to: Uuid,
    id: &str,
    content: &str,
) -> AppResult<Message> {
    let author = Author { kind: AuthorKind::System, id: id.to_string() };
    let message = Message::new(author, content.to_string(), MessageStatus::Complete, Some(reply_to));
    project.lock().persist(
        conversation_id,
        EventKind::MessageCreated {
            message: message.clone(),
        },
    )?;
    Ok(message)
}

/// Marks replies left streaming by a previous session as failed with code `interrupted`.
pub fn recover_interrupted(project: &Project) -> AppResult<()> {
    let mut state = project.lock();
    for MessageAt { message: message_id, .. } in state.streaming_messages(None)? {
        fail_locked(
            &mut state,
            message_id,
            "interrupted",
            "Mini-Me closed before this reply finished.",
        )?;
    }
    Ok(())
}

fn validate_emoji(emoji: &str) -> AppResult<()> {
    let length = emoji.chars().count();
    if length == 0 || length > MAX_EMOJI_CHARS || emoji.trim() != emoji {
        return Err(AppError::invalid_input("That reaction is not valid."));
    }
    Ok(())
}

/// Does nothing if the same author already reacted with that emoji.
pub fn add_reaction(project: &Project, message_id: Uuid, emoji: &str, by: Author) -> AppResult<()> {
    validate_emoji(emoji)?;
    let mut state = project.lock();
    let (conversation, _) = state
        .message_place(message_id)?
        .ok_or_else(|| AppError::not_found("Message not found"))?;
    if state.has_reaction(message_id, emoji, &by)? {
        return Ok(());
    }
    state.persist(
        conversation,
        EventKind::ReactionAdded {
            message_id,
            emoji: emoji.to_string(),
            by,
        },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::test_support::temp_project;

    fn text(content: &str) -> SendMessageInput {
        SendMessageInput {
            content: content.to_string(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        }
    }

    fn echo() -> Author {
        Author {
            kind: AuthorKind::System,
            id: "echo".to_string(),
        }
    }

    #[test]
    fn deleting_a_conversation_clears_every_table_that_points_at_it() {
        let (_dir, project) = temp_project();
        let gone = create(&project).unwrap().id;
        send_message(&project, gone, text("remove"), new_id()).unwrap();
        let state = project.lock();
        let conn = &state.conn;

        // Foreign keys are off while the rows are made, so the columns that point elsewhere
        // (such as a thread's asset) need no parent.
        conn.pragma_update(None, "foreign_keys", false).unwrap();
        let names = |sql: &str, arg: &str| -> Vec<String> {
            let mut stmt = conn.prepare(sql).unwrap();
            let rows = stmt.query_map(params![arg], |row| row.get(0)).unwrap();
            rows.collect::<Result<_, _>>().unwrap()
        };
        // Parents in the order their dependents are made: a component needs its message.
        for parent in ["conversations", "messages", "components"] {
            let tables = names(
                "SELECT m.name FROM sqlite_master m, pragma_foreign_key_list(m.name) f \
                 WHERE m.type = 'table' AND f.\"table\" = ?1",
                parent,
            );
            let parent_id: String = conn
                .query_row(&format!("SELECT id FROM {parent} LIMIT 1"), [], |row| row.get(0))
                .unwrap();
            for table in tables {
                let column: String = conn
                    .query_row(
                        "SELECT \"from\" FROM pragma_foreign_key_list(?1) WHERE \"table\" = ?2",
                        params![table, parent],
                        |row| row.get(0),
                    )
                    .unwrap();
                let rows: i64 =
                    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap();
                if rows > 0 {
                    conn.execute(&format!("UPDATE {table} SET {column} = ?1"), params![parent_id])
                        .unwrap();
                    continue;
                }
                let columns = names("SELECT name FROM pragma_table_info(?1)", &table);
                let values: Vec<String> = columns
                    .iter()
                    .map(|name| if *name == column { format!("'{parent_id}'") } else { "0".into() })
                    .collect();
                let sql = format!("INSERT INTO {table} VALUES ({})", values.join(", "));
                conn.execute(&sql, []).unwrap();
            }
        }
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        drop(state);

        let kept = create(&project).unwrap().id;
        send_message(&project, kept, text("keep"), new_id()).unwrap();
        delete(&project, gone).unwrap();
        let ids: Vec<_> = list(&project).unwrap().into_iter().map(|c| c.id).collect();
        assert_eq!(ids, [kept]);
        let state = project.lock();
        let kept_messages: i64 = state
            .conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
                params![kept.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kept_messages, 1);
    }

    /// A Conversation whose reply to "q" is paused at an approval.
    fn paused_reply(written: bool) -> (tempfile::TempDir, Project, Uuid, PausedRun) {
        let (dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let question = send_message(&project, conversation, text("q"), new_id()).unwrap();
        let reply = start_reply(&project, conversation, question.id, echo()).unwrap();
        let paused = PausedRun {
            message_id: reply,
            step_id: "ask".into(),
            component_id: new_id(),
            run: serde_json::json!({ "input": { "text": "q" } }),
            output: Some("the plan".into()),
            state: "opaque".into(),
        };
        pause_reply(&project, paused.clone(), "Go on?", written).unwrap();
        (dir, project, conversation, paused)
    }

    #[test]
    fn interrupted_replies_are_marked_failed() {
        let (_dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let question = send_message(&project, conversation, text("q"), new_id()).unwrap();
        let reply = start_reply(&project, conversation, question.id, echo()).unwrap();

        recover_interrupted(&project).unwrap();

        let events = project.lock().events_after(conversation, 0).unwrap();
        match &events.last().unwrap().kind {
            EventKind::MessageFailed { message_id, error } => {
                assert_eq!(*message_id, reply);
                assert_eq!(error.code, "interrupted");
            }
            other => panic!("expected message.failed, got {other:?}"),
        }

        let (_paused_dir, project, conversation, paused) = paused_reply(false);
        let err = send_message(&project, conversation, text("next"), new_id()).unwrap_err();
        assert_eq!(err.code, "reply_in_progress");

        recover_interrupted(&project).unwrap();
        let (_, message) = project.lock().load_message(paused.message_id).unwrap().unwrap();
        assert_eq!(message.status, MessageStatus::Paused);
        assert_eq!(message.components[0].kind, "approval");
        let saved = paused_run(&project, paused.message_id, paused.component_id).unwrap();
        assert_eq!(saved, paused);
    }

}
