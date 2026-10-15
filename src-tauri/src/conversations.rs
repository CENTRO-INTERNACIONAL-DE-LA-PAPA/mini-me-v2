//! Conversations and the message lifecycle. Every message change goes through
//! `ProjectState::persist`, so it is stored as an event before anyone sees it.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::assets;
use crate::components;
use crate::error::{AppError, AppResult};
use crate::protocol::{
    AssetRef, Author, AuthorKind, Component, ErrorInfo, EventKind, Message, MessageStatus,
    TextComponent, TextComponentKind, new_id, now_ms,
};
use crate::store::{Project, ProjectState};

pub const DEFAULT_TITLE: &str = "New conversation";
const MAX_EMOJI_CHARS: usize = 16;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConversationSummary {
    pub id: Uuid,
    pub title: String,
    pub created_at: i64,
    pub last_activity_at: i64,
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
    let now = now_ms();
    let summary = ConversationSummary {
        id: new_id(),
        title: DEFAULT_TITLE.to_string(),
        created_at: now,
        last_activity_at: now,
    };
    project.lock().conn.execute(
        "INSERT INTO conversations (id, title, created_at, last_activity_at) \
         VALUES (?1, ?2, ?3, ?4)",
        params![summary.id.to_string(), summary.title, now, now],
    )?;
    Ok(summary)
}

/// Conversations ordered by most recent activity first.
pub fn list(project: &Project) -> AppResult<Vec<ConversationSummary>> {
    let state = project.lock();
    let mut stmt = state.conn.prepare(
        "SELECT id, title, created_at, last_activity_at FROM conversations \
         ORDER BY last_activity_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    let mut conversations = Vec::new();
    for row in rows {
        let (id, title, created_at, last_activity_at) = row?;
        conversations.push(ConversationSummary {
            id: Uuid::parse_str(&id).map_err(|_| AppError::storage("stored ID is not readable"))?,
            title,
            created_at,
            last_activity_at,
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

/// Validates and persists a user message. Fails with `reply_in_progress` while a reply in
/// the same Conversation is still streaming.
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
    if !state.streaming_messages(Some(conversation_id))?.is_empty() {
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

    let message = Message {
        id: new_id(),
        author: Author {
            kind: AuthorKind::User,
            id: user_id.to_string(),
        },
        content: input.content,
        status: MessageStatus::Complete,
        reply_to: None,
        attachments,
        text_components: input.text_components,
        components: Vec::new(),
    };
    state.persist(
        conversation_id,
        EventKind::MessageCreated {
            message: message.clone(),
        },
    )?;
    Ok(message)
}

/// Loads a message and checks it is a reply that is still streaming.
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
    let message = Message {
        id: new_id(),
        author,
        content: String::new(),
        status: MessageStatus::Streaming,
        reply_to: Some(reply_to),
        attachments: Vec::new(),
        text_components: Vec::new(),
        components: Vec::new(),
    };
    let id = message.id;
    project
        .lock()
        .persist(conversation_id, EventKind::MessageCreated { message })?;
    Ok(id)
}

pub fn append_delta(project: &Project, message_id: Uuid, text: &str) -> AppResult<()> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    state.persist(
        conversation,
        EventKind::MessageDelta {
            message_id,
            text: text.to_string(),
        },
    )?;
    Ok(())
}

/// Adds an Interactive Component `(kind, version, data, text)` to a streaming reply, if
/// `allowed` (the kinds the reply's Trait lists) holds its kind; returns its new ID.
pub fn add_component(
    project: &Project,
    message_id: Uuid,
    allowed: &[String],
    (kind, version, data, text): (&str, u32, serde_json::Value, String),
) -> AppResult<Uuid> {
    components::check(kind, allowed, &data, &text)?;
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    let component = Component {
        id: new_id(),
        kind: kind.to_string(),
        version,
        data,
        text,
    };
    let id = component.id;
    state.persist(conversation, EventKind::ComponentAdded { message_id, component })?;
    Ok(id)
}

/// Stores a file a Trait produced as a generated Asset and attaches it to its streaming
/// reply. If the reply ends before the attachment is persisted, the Asset is removed again.
pub fn attach_generated(
    project: &Project,
    message_id: Uuid,
    name: &str,
    media_type: &str,
    bytes: &[u8],
) -> AppResult<AssetRef> {
    streaming_reply(&project.lock(), message_id)?;
    let asset = assets::write_generated(project, name, media_type, bytes)?;
    let attached = {
        let mut state = project.lock();
        streaming_reply(&state, message_id).and_then(|conversation| {
            let event = EventKind::AttachmentAdded { message_id, asset: asset.clone() };
            state.persist(conversation, event)
        })
    };
    if let Err(err) = attached {
        let _ = assets::remove(project, asset.id);
        return Err(err);
    }
    Ok(asset)
}

pub fn complete_reply(project: &Project, message_id: Uuid) -> AppResult<()> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    let content = state
        .load_message_with(message_id, false)?
        .map(|(_, message)| message.content)
        .unwrap_or_default();
    state.persist(conversation, EventKind::MessageCompleted { message_id, content })?;
    Ok(())
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
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    state.persist(
        conversation,
        EventKind::MessageProgress {
            message_id,
            label: label.to_string(),
            fraction: fraction.map(|f| f.clamp(0.0, 1.0)),
        },
    )?;
    Ok(())
}

/// Ends a streaming reply as cancelled; a reply that has already ended is left as it is.
pub fn cancel_reply(project: &Project, message_id: Uuid) -> AppResult<()> {
    let mut state = project.lock();
    let conversation = streaming_reply(&state, message_id)?;
    state.persist(conversation, EventKind::MessageCancelled { message_id })?;
    Ok(())
}

/// Stops the reply streaming in a Conversation, if any, and returns the stopped replies'
/// IDs. The producer's later updates are rejected because the reply is no longer streaming.
pub fn stop_reply(project: &Project, conversation_id: Uuid) -> AppResult<Vec<Uuid>> {
    let mut state = project.lock();
    state.require_conversation(conversation_id)?;
    let mut stopped = Vec::new();
    for (_, message_id) in state.streaming_messages(Some(conversation_id))? {
        state.persist(conversation_id, EventKind::MessageCancelled { message_id })?;
        stopped.push(message_id);
    }
    Ok(stopped)
}

/// Marks replies left streaming by a previous session as failed with code `interrupted`.
/// The names of a message's attached and referenced files, without duplicates.
pub fn file_names(message: &Message) -> Vec<String> {
    let mut names: Vec<String> = message.attachments.iter().map(|a| a.name.clone()).collect();
    for component in &message.text_components {
        if component.kind == TextComponentKind::Asset {
            let name = component.label.trim_start_matches('#').to_string();
            if !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names
}

/// Stores Jev's raw answers about `message_id`, for the "Show Jev's answers" developer
/// setting.
pub fn record_jev_answers(
    project: &Project,
    conversation_id: Uuid,
    message_id: Uuid,
    answers: serde_json::Value,
    error: Option<ErrorInfo>,
) -> AppResult<()> {
    project.lock().persist(
        conversation_id,
        EventKind::RoutingAnswered {
            message_id,
            answers,
            error,
        },
    )?;
    Ok(())
}

/// Persists a reply that is complete from the start, written by the app itself rather than
/// produced by a Trait.
pub fn system_reply(
    project: &Project,
    conversation_id: Uuid,
    reply_to: Uuid,
    id: &str,
    content: &str,
) -> AppResult<Message> {
    let message = Message {
        id: new_id(),
        author: Author {
            kind: AuthorKind::System,
            id: id.to_string(),
        },
        content: content.to_string(),
        status: MessageStatus::Complete,
        reply_to: Some(reply_to),
        attachments: Vec::new(),
        text_components: Vec::new(),
        components: Vec::new(),
    };
    project.lock().persist(
        conversation_id,
        EventKind::MessageCreated {
            message: message.clone(),
        },
    )?;
    Ok(message)
}

pub fn recover_interrupted(project: &Project) -> AppResult<()> {
    let mut state = project.lock();
    for (_, message_id) in state.streaming_messages(None)? {
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

/// Adds a reaction; does nothing if the same author already reacted with that emoji.
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

/// Removes a reaction; does nothing if it does not exist.
pub fn remove_reaction(
    project: &Project,
    message_id: Uuid,
    emoji: &str,
    by: Author,
) -> AppResult<()> {
    let mut state = project.lock();
    let (conversation, _) = state
        .message_place(message_id)?
        .ok_or_else(|| AppError::not_found("Message not found"))?;
    if !state.has_reaction(message_id, emoji, &by)? {
        return Ok(());
    }
    state.persist(
        conversation,
        EventKind::ReactionRemoved {
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
    use crate::store::test_support::Collector;

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

    fn user(id: Uuid) -> Author {
        Author {
            kind: AuthorKind::User,
            id: id.to_string(),
        }
    }

    #[test]
    fn new_message_moves_conversation_to_top() {
        let (_dir, project) = temp_project();
        let older = create(&project).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let newer = create(&project).unwrap();
        assert_eq!(list(&project).unwrap()[0].id, newer.id);

        std::thread::sleep(std::time::Duration::from_millis(5));
        send_message(&project, older.id, text("hello"), new_id()).unwrap();
        assert_eq!(list(&project).unwrap()[0].id, older.id);
    }

    #[test]
    fn rejects_empty_messages() {
        let (_dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let err = send_message(&project, conversation, text("   "), new_id()).unwrap_err();
        assert_eq!(err.code, "invalid_input");
    }

    #[test]
    fn rejects_unknown_attachments_and_references() {
        let (_dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;

        let mut with_attachment = text("see file");
        with_attachment.attachments.push(new_id());
        assert_eq!(
            send_message(&project, conversation, with_attachment, new_id())
                .unwrap_err()
                .code,
            "not_found"
        );

        let mut with_reference = text("see #missing");
        with_reference.text_components.push(TextComponent {
            kind: TextComponentKind::Asset,
            id: new_id(),
            label: "#missing".to_string(),
            start: 4,
            end: 12,
        });
        assert_eq!(
            send_message(&project, conversation, with_reference, new_id())
                .unwrap_err()
                .code,
            "not_found"
        );
        assert!(project.lock().events_after(conversation, 0).unwrap().is_empty());
    }

    #[test]
    fn rejects_references_outside_the_content() {
        let (dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let source = dir.path().join("trial.csv");
        std::fs::write(&source, "a,b").unwrap();
        let asset = assets::import(&project, &source).unwrap();

        // "é" is one UTF-16 code unit, so this content is 6 units long.
        let mut input = text("é #x y");
        input.text_components.push(TextComponent {
            kind: TextComponentKind::Asset,
            id: asset.id,
            label: "#x".to_string(),
            start: 2,
            end: 7,
        });
        assert_eq!(
            send_message(&project, conversation, input, new_id())
                .unwrap_err()
                .code,
            "invalid_input"
        );
    }

    #[test]
    fn only_one_reply_at_a_time_per_conversation() {
        let (_dir, project) = temp_project();
        let busy = create(&project).unwrap().id;
        let other = create(&project).unwrap().id;
        let question = send_message(&project, busy, text("first"), new_id()).unwrap();
        start_reply(&project, busy, question.id, echo()).unwrap();

        let err = send_message(&project, busy, text("second"), new_id()).unwrap_err();
        assert_eq!(err.code, "reply_in_progress");
        send_message(&project, other, text("elsewhere"), new_id()).unwrap();
    }

    #[test]
    fn stopping_a_reply_blocks_further_updates() {
        let (_dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let question = send_message(&project, conversation, text("q"), new_id()).unwrap();
        let reply = start_reply(&project, conversation, question.id, echo()).unwrap();
        append_delta(&project, reply, "The main cause").unwrap();

        stop_reply(&project, conversation).unwrap();
        assert_eq!(append_delta(&project, reply, " is").unwrap_err().code, "reply_finished");
        assert!(complete_reply(&project, reply).is_err());

        let (_, message) = project.lock().load_message(reply).unwrap().unwrap();
        assert_eq!(message.status, MessageStatus::Cancelled);
        assert_eq!(message.content, "The main cause");
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
    }

    #[test]
    fn duplicate_reactions_are_ignored() {
        let (_dir, project) = temp_project();
        let conversation = create(&project).unwrap().id;
        let user_id = new_id();
        let message = send_message(&project, conversation, text("hi"), user_id).unwrap();
        let collector = Collector::default();
        project
            .subscribe(conversation, 1, Box::new(collector.clone()))
            .unwrap();

        add_reaction(&project, message.id, "👍", user(user_id)).unwrap();
        add_reaction(&project, message.id, "👍", user(user_id)).unwrap();
        assert_eq!(collector.events().len(), 1);

        remove_reaction(&project, message.id, "👍", user(user_id)).unwrap();
        remove_reaction(&project, message.id, "👍", user(user_id)).unwrap();
        assert_eq!(collector.events().len(), 2);
    }
}
