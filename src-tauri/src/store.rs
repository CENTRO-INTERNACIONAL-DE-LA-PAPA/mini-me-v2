//! An open Project: its database, the event log, and delivery to subscribers.
//!
//! One lock per Project covers sequence assignment, the database transaction and delivery,
//! so events reach subscribers only after they are committed, and always in `seq` order.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::paths::ProjectPaths;
use crate::protocol::{
    AssetRef, Author, AuthorKind, Component, ENVELOPE_VERSION, Event, EventKind, Message,
    MessageStatus, MessageStep, Origin, TextComponent, new_id, now_ms,
};

/// Receives delivered events. Returns `false` when the subscriber is gone and should be
/// dropped.
pub trait EventSink: Send {
    fn send(&self, event: &Event) -> bool;
}

pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub paths: ProjectPaths,
    inner: Mutex<ProjectState>,
}

pub struct ProjectState {
    pub conn: Connection,
    project_id: Uuid,
    origin: Origin,
    subscribers: HashMap<Uuid, Vec<Box<dyn EventSink>>>,
}

impl Project {
    pub fn new(id: Uuid, name: String, paths: ProjectPaths, conn: Connection, origin: Origin) -> Self {
        Self {
            id,
            name,
            paths,
            inner: Mutex::new(ProjectState {
                conn,
                project_id: id,
                origin,
                subscribers: HashMap::new(),
            }),
        }
    }

    pub fn lock(&self) -> MutexGuard<'_, ProjectState> {
        self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Delivers every stored event after `after_seq`, then registers the sink for new events.
    /// Both happen under the Project lock, so no event is missed or duplicated.
    pub fn subscribe(
        &self,
        conversation_id: Uuid,
        after_seq: i64,
        sink: Box<dyn EventSink>,
    ) -> AppResult<()> {
        let mut state = self.lock();
        state.require_conversation(conversation_id)?;
        for event in state.events_after(conversation_id, after_seq)? {
            if !sink.send(&event) {
                return Ok(());
            }
        }
        state
            .subscribers
            .entry(conversation_id)
            .or_default()
            .push(sink);
        Ok(())
    }
}

impl ProjectState {
    pub fn require_conversation(&self, conversation_id: Uuid) -> AppResult<()> {
        let exists: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1 FROM conversations WHERE id = ?1",
                params![conversation_id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        exists
            .map(|_| ())
            .ok_or_else(|| AppError::not_found("Conversation not found"))
    }

    pub fn events_after(&self, conversation_id: Uuid, after_seq: i64) -> AppResult<Vec<Event>> {
        let mut stmt = self.conn.prepare(
            "SELECT body FROM events WHERE conversation_id = ?1 AND seq > ?2 ORDER BY seq",
        )?;
        let rows = stmt.query_map(params![conversation_id.to_string(), after_seq], |row| {
            row.get::<_, String>(0)
        })?;
        let mut events = Vec::new();
        for body in rows {
            events.push(serde_json::from_str(&body?)?);
        }
        Ok(events)
    }

    /// Assigns the next sequence number, stores the event and its projection in one
    /// transaction, and only then delivers it.
    pub fn persist(&mut self, conversation_id: Uuid, kind: EventKind) -> AppResult<Event> {
        let mut events = self.persist_all(conversation_id, vec![kind], |_| Ok(()))?;
        Ok(events.remove(0))
    }

    /// Stores `kinds` as consecutive events, their projections and whatever `also` writes,
    /// all in one transaction, then delivers the events in order.
    pub fn persist_all(
        &mut self,
        conversation_id: Uuid,
        kinds: Vec<EventKind>,
        also: impl FnOnce(&Transaction<'_>) -> AppResult<()>,
    ) -> AppResult<Vec<Event>> {
        let last_seq: i64 = self
            .conn
            .query_row(
                "SELECT last_seq FROM conversations WHERE id = ?1",
                params![conversation_id.to_string()],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::not_found("Conversation not found"))?;

        let tx = self.conn.transaction()?;
        let mut events = Vec::with_capacity(kinds.len());
        for (i, kind) in kinds.into_iter().enumerate() {
            let event = Event {
                id: new_id(),
                v: ENVELOPE_VERSION,
                project_id: self.project_id,
                conversation_id,
                seq: last_seq + 1 + i as i64,
                ts: now_ms(),
                origin: self.origin,
                kind,
            };
            let body = serde_json::to_string(&event)?;
            let type_name = serde_json::to_value(&event)?["type"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            tx.execute(
                "INSERT INTO events (conversation_id, seq, id, type, ts, body) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    conversation_id.to_string(),
                    event.seq,
                    event.id.to_string(),
                    type_name,
                    event.ts,
                    body
                ],
            )?;
            apply_projection(&tx, &event)?;
            events.push(event);
        }
        also(&tx)?;
        if let Some(last) = events.last() {
            tx.execute(
                "UPDATE conversations SET last_seq = ?2, last_activity_at = ?3 WHERE id = ?1",
                params![conversation_id.to_string(), last.seq, last.ts],
            )?;
        }
        tx.commit()?;

        if let Some(sinks) = self.subscribers.get_mut(&conversation_id) {
            for event in &events {
                sinks.retain(|sink| sink.send(event));
            }
        }
        Ok(events)
    }

    /// The Conversation and status of a message, without reading its content or components.
    pub fn message_place(&self, message_id: Uuid) -> AppResult<Option<(Uuid, MessageStatus)>> {
        let row = self
            .conn
            .query_row(
                "SELECT conversation_id, status FROM messages WHERE id = ?1",
                params![message_id.to_string()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((conversation, status)) = row else {
            return Ok(None);
        };
        let corrupt = || AppError::storage("stored message is not readable");
        let conversation = Uuid::parse_str(&conversation).map_err(|_| corrupt())?;
        Ok(Some((conversation, MessageStatus::parse(&status).ok_or_else(corrupt)?)))
    }

    /// A message with all of its components' data; the app itself reads messages through
    /// `message_place` and `load_message_with`.
    #[cfg(test)]
    pub fn load_message(&self, message_id: Uuid) -> AppResult<Option<(Uuid, Message)>> {
        self.load_message_with(message_id, true)
    }

    /// A message, with its components' `data` when `component_data` is set and `null` instead
    /// otherwise (their `text` is always read).
    pub fn load_message_with(
        &self,
        message_id: Uuid,
        component_data: bool,
    ) -> AppResult<Option<(Uuid, Message)>> {
        let row = self
            .conn
            .query_row(
                "SELECT conversation_id, author_kind, author_id, content, status, reply_to, \
                 attachments, text_components FROM messages WHERE id = ?1",
                params![message_id.to_string()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                },
            )
            .optional()?;
        let Some((conversation, kind, author_id, content, status, reply_to, attachments, components)) =
            row
        else {
            return Ok(None);
        };
        let corrupt = || AppError::storage("stored message is not readable");
        let message = Message {
            id: message_id,
            author: Author {
                kind: AuthorKind::parse(&kind).ok_or_else(corrupt)?,
                id: author_id,
            },
            content,
            status: MessageStatus::parse(&status).ok_or_else(corrupt)?,
            reply_to: reply_to.map(|id| Uuid::parse_str(&id)).transpose().map_err(|_| corrupt())?,
            attachments: serde_json::from_str::<Vec<AssetRef>>(&attachments)?,
            text_components: serde_json::from_str::<Vec<TextComponent>>(&components)?,
            components: self.message_components(message_id, component_data)?,
            steps: self.message_steps(message_id)?,
        };
        let conversation = Uuid::parse_str(&conversation).map_err(|_| corrupt())?;
        Ok(Some((conversation, message)))
    }

    /// A message's Interactive Components, in the order they were added; with `data` `null`
    /// unless `with_data` is set.
    fn message_components(&self, message_id: Uuid, with_data: bool) -> AppResult<Vec<Component>> {
        let mut stmt = self.conn.prepare(if with_data {
            "SELECT id, kind, version, data, text, answer FROM components \
             WHERE message_id = ?1 ORDER BY rowid"
        } else {
            "SELECT id, kind, version, 'null', text, answer FROM components \
             WHERE message_id = ?1 ORDER BY rowid"
        })?;
        let rows = stmt.query_map(params![message_id.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u32>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        let mut components = Vec::new();
        for row in rows {
            let (id, kind, version, data, text, answer) = row?;
            components.push(Component {
                id: Uuid::parse_str(&id)
                    .map_err(|_| AppError::storage("stored component is not readable"))?,
                kind,
                version,
                data: serde_json::from_str(&data)?,
                text,
                answer: answer.map(|a| serde_json::from_str(&a)).transpose()?.unwrap_or_default(),
            });
        }
        Ok(components)
    }

    /// The Steps a reply's Workflow has started, in order.
    fn message_steps(&self, message_id: Uuid) -> AppResult<Vec<MessageStep>> {
        let mut stmt = self.conn.prepare(
            "SELECT step_id, type, name, output, done FROM message_steps WHERE message_id = ?1 \
             ORDER BY position",
        )?;
        let rows = stmt.query_map(params![message_id.to_string()], |row| {
            Ok(MessageStep {
                step_id: row.get(0)?,
                step_type: row.get(1)?,
                name: row.get(2)?,
                output: row.get(3)?,
                done: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// IDs of messages still streaming, optionally limited to one Conversation.
    pub fn streaming_messages(&self, conversation_id: Option<Uuid>) -> AppResult<Vec<(Uuid, Uuid)>> {
        self.messages_with_status(&[MessageStatus::Streaming], conversation_id)
    }

    /// `(conversation, message)` IDs of the messages whose status is one of `statuses`,
    /// optionally limited to one Conversation.
    pub fn messages_with_status(
        &self,
        statuses: &[MessageStatus],
        conversation_id: Option<Uuid>,
    ) -> AppResult<Vec<(Uuid, Uuid)>> {
        // The statuses are fixed identifiers, so listing them in the SQL text is safe.
        let listed: Vec<String> = statuses.iter().map(|s| format!("'{}'", s.as_str())).collect();
        let mut stmt = self.conn.prepare(&format!(
            "SELECT conversation_id, id FROM messages WHERE status IN ({}) \
             AND (?1 IS NULL OR conversation_id = ?1)",
            listed.join(", ")
        ))?;
        let rows = stmt.query_map(params![conversation_id.map(|id| id.to_string())], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut result = Vec::new();
        for row in rows {
            let (conversation, message) = row?;
            let parse = |s: &str| {
                Uuid::parse_str(s).map_err(|_| AppError::storage("stored ID is not readable"))
            };
            result.push((parse(&conversation)?, parse(&message)?));
        }
        Ok(result)
    }

    /// Every message of the Conversation, in the order they were created. Their components
    /// carry only `text` (`data` is `null`), which is all a history needs.
    pub fn conversation_messages(&self, conversation_id: Uuid) -> AppResult<Vec<Message>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM messages WHERE conversation_id = ?1 ORDER BY rowid")?;
        let ids = stmt
            .query_map(params![conversation_id.to_string()], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut messages = Vec::with_capacity(ids.len());
        for id in ids {
            let id = Uuid::parse_str(&id)
                .map_err(|_| AppError::storage("stored message is not readable"))?;
            if let Some((_, message)) = self.load_message_with(id, false)? {
                messages.push(message);
            }
        }
        Ok(messages)
    }

    pub fn has_reaction(&self, message_id: Uuid, emoji: &str, by: &Author) -> AppResult<bool> {
        let found: Option<i64> = self
            .conn
            .query_row(
                "SELECT 1 FROM reactions WHERE message_id = ?1 AND emoji = ?2 \
                 AND by_kind = ?3 AND by_id = ?4",
                params![message_id.to_string(), emoji, by.kind.as_str(), by.id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    }
}

fn apply_projection(tx: &Transaction<'_>, event: &Event) -> AppResult<()> {
    match &event.kind {
        EventKind::MessageCreated { message } => {
            tx.execute(
                "INSERT INTO messages (id, conversation_id, author_kind, author_id, content, \
                 status, reply_to, attachments, text_components, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    message.id.to_string(),
                    event.conversation_id.to_string(),
                    message.author.kind.as_str(),
                    message.author.id,
                    message.content,
                    message.status.as_str(),
                    message.reply_to.map(|id| id.to_string()),
                    serde_json::to_string(&message.attachments)?,
                    serde_json::to_string(&message.text_components)?,
                    event.ts
                ],
            )?;
        }
        EventKind::MessageDelta { message_id, text } => {
            tx.execute(
                "UPDATE messages SET content = content || ?2 WHERE id = ?1",
                params![message_id.to_string(), text],
            )?;
        }
        // Progress is shown only while a reply streams, so it has no projection.
        EventKind::MessageProgress { .. } | EventKind::RoutingAnswered { .. } => {}
        EventKind::MessagePaused { message_id } => {
            tx.execute(
                "UPDATE messages SET status = 'paused' WHERE id = ?1",
                params![message_id.to_string()],
            )?;
        }
        EventKind::MessageResumed { message_id } => {
            tx.execute(
                "UPDATE messages SET status = 'streaming' WHERE id = ?1",
                params![message_id.to_string()],
            )?;
        }
        EventKind::StepStarted { message_id, step_id, step_type, name } => {
            tx.execute(
                "INSERT INTO message_steps (message_id, position, step_id, type, name) \
                 SELECT ?1, COALESCE(MAX(position), 0) + 1, ?2, ?3, ?4 FROM message_steps \
                 WHERE message_id = ?1",
                params![message_id.to_string(), step_id, step_type, name],
            )?;
        }
        // A Step inside a loop starts once per iteration, so the latest run is completed.
        EventKind::StepCompleted { message_id, step_id, output } => {
            tx.execute(
                "UPDATE message_steps SET output = ?3, done = 1 WHERE message_id = ?1 \
                 AND position = (SELECT MAX(position) FROM message_steps \
                 WHERE message_id = ?1 AND step_id = ?2)",
                params![message_id.to_string(), step_id, output],
            )?;
        }
        EventKind::ComponentAnswered { message_id, component_id, answer } => {
            tx.execute(
                "UPDATE components SET answer = ?3 WHERE id = ?1 AND message_id = ?2 \
                 AND answer IS NULL",
                params![
                    component_id.to_string(),
                    message_id.to_string(),
                    serde_json::to_string(answer)?
                ],
            )?;
        }
        EventKind::MessageCompleted { message_id, content } => {
            tx.execute(
                "UPDATE messages SET content = ?2, status = 'complete' WHERE id = ?1",
                params![message_id.to_string(), content],
            )?;
        }
        EventKind::MessageFailed { message_id, .. } => {
            tx.execute(
                "UPDATE messages SET status = 'failed' WHERE id = ?1",
                params![message_id.to_string()],
            )?;
        }
        EventKind::MessageCancelled { message_id } => {
            tx.execute(
                "UPDATE messages SET status = 'cancelled' WHERE id = ?1",
                params![message_id.to_string()],
            )?;
        }
        EventKind::AttachmentAdded { message_id, asset } => {
            let current: String = tx.query_row(
                "SELECT attachments FROM messages WHERE id = ?1",
                params![message_id.to_string()],
                |row| row.get(0),
            )?;
            let mut attachments: Vec<AssetRef> = serde_json::from_str(&current)?;
            attachments.push(asset.clone());
            tx.execute(
                "UPDATE messages SET attachments = ?2 WHERE id = ?1",
                params![message_id.to_string(), serde_json::to_string(&attachments)?],
            )?;
        }
        EventKind::ComponentAdded { message_id, component } => {
            tx.execute(
                "INSERT INTO components (id, message_id, kind, version, data, text, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    component.id.to_string(),
                    message_id.to_string(),
                    component.kind,
                    component.version,
                    serde_json::to_string(&component.data)?,
                    component.text,
                    event.ts
                ],
            )?;
        }
        EventKind::ReactionAdded { message_id, emoji, by } => {
            tx.execute(
                "INSERT OR IGNORE INTO reactions (message_id, emoji, by_kind, by_id) \
                 VALUES (?1, ?2, ?3, ?4)",
                params![message_id.to_string(), emoji, by.kind.as_str(), by.id],
            )?;
        }
        EventKind::ReactionRemoved { message_id, emoji, by } => {
            tx.execute(
                "DELETE FROM reactions WHERE message_id = ?1 AND emoji = ?2 \
                 AND by_kind = ?3 AND by_id = ?4",
                params![message_id.to_string(), emoji, by.kind.as_str(), by.id],
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
pub mod test_support {
    use std::sync::{Arc, Mutex};

    use super::*;

    /// Collects delivered events for assertions.
    #[derive(Clone, Default)]
    pub struct Collector(pub Arc<Mutex<Vec<Event>>>);

    impl Collector {
        pub fn events(&self) -> Vec<Event> {
            self.0.lock().unwrap().clone()
        }
    }

    impl EventSink for Collector {
        fn send(&self, event: &Event) -> bool {
            self.0.lock().unwrap().push(event.clone());
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::Collector;
    use super::*;
    use crate::conversations;
    use crate::projects::test_support::temp_project;

    fn cancel(id: Uuid) -> EventKind {
        EventKind::MessageCancelled { message_id: id }
    }

    #[test]
    fn sequences_are_contiguous_and_per_conversation() {
        let (_dir, project) = temp_project();
        let a = conversations::create(&project).unwrap().id;
        let b = conversations::create(&project).unwrap().id;
        let mut state = project.lock();
        let seqs_a: Vec<i64> = (0..5)
            .map(|_| state.persist(a, cancel(new_id())).unwrap().seq)
            .collect();
        let seqs_b: Vec<i64> = (0..2)
            .map(|_| state.persist(b, cancel(new_id())).unwrap().seq)
            .collect();
        assert_eq!(seqs_a, vec![1, 2, 3, 4, 5]);
        assert_eq!(seqs_b, vec![1, 2]);
    }

    #[test]
    fn failed_insert_is_not_delivered() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        let collector = Collector::default();
        project
            .subscribe(conversation, 0, Box::new(collector.clone()))
            .unwrap();

        let mut state = project.lock();
        state.conn.execute_batch("DROP TABLE events").unwrap();
        assert!(state.persist(conversation, cancel(new_id())).is_err());
        assert!(collector.events().is_empty());
    }

    #[test]
    fn subscribe_replays_after_seq_then_streams() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        {
            let mut state = project.lock();
            for _ in 0..4 {
                state.persist(conversation, cancel(new_id())).unwrap();
            }
        }
        let collector = Collector::default();
        project
            .subscribe(conversation, 2, Box::new(collector.clone()))
            .unwrap();
        project
            .lock()
            .persist(conversation, cancel(new_id()))
            .unwrap();

        let seqs: Vec<i64> = collector.events().iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![3, 4, 5]);
    }

    #[test]
    fn components_are_rebuilt_in_the_order_they_were_added() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        let input = conversations::SendMessageInput {
            content: "papers on late blight".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let question =
            conversations::send_message(&project, conversation, input, new_id()).unwrap();
        let author = Author {
            kind: AuthorKind::MiniMe,
            id: "researcher".into(),
        };
        let reply =
            conversations::start_reply(&project, conversation, question.id, author).unwrap();

        let component = |kind: &str, text: &str| Component {
            id: new_id(),
            kind: kind.into(),
            version: 1,
            data: serde_json::json!({ "papers": [] }),
            text: text.into(),
            answer: serde_json::Value::Null,
        };
        let first = component("paper-sources", "first");
        let second = component("theories", "second");
        {
            let mut state = project.lock();
            for component in [&first, &second] {
                let kind = EventKind::ComponentAdded {
                    message_id: reply,
                    component: component.clone(),
                };
                state.persist(conversation, kind).unwrap();
            }
        }

        let (_, message) = project.lock().load_message(reply).unwrap().unwrap();
        assert_eq!(message.components, vec![first.clone(), second]);

        let history = project.lock().conversation_messages(conversation).unwrap();
        let in_history = &history.iter().find(|m| m.id == reply).unwrap().components[0];
        assert_eq!((in_history.text.as_str(), &in_history.data), ("first", &serde_json::Value::Null));
        let (_, question) = project.lock().load_message(question.id).unwrap().unwrap();
        assert!(question.components.is_empty());
    }

    #[test]
    fn steps_pauses_and_answers_are_rebuilt_from_events() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        let input = conversations::SendMessageInput {
            content: "does early planting reduce late blight?".into(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let question =
            conversations::send_message(&project, conversation, input, new_id()).unwrap();
        let author = Author {
            kind: AuthorKind::MiniMe,
            id: "investigator".into(),
        };
        let reply =
            conversations::start_reply(&project, conversation, question.id, author).unwrap();
        let started = |step_id: &str| EventKind::StepStarted {
            message_id: reply,
            step_id: step_id.into(),
            step_type: "trait".into(),
            name: "Refute".into(),
        };
        let completed = |step_id: &str, output: &str| EventKind::StepCompleted {
            message_id: reply,
            step_id: step_id.into(),
            output: Some(output.into()),
        };
        let approval = Component {
            id: new_id(),
            kind: "approval".into(),
            version: 1,
            data: serde_json::json!({ "step_id": "ask", "prompt": "Go on?" }),
            text: "Go on?".into(),
            answer: serde_json::Value::Null,
        };
        let answered = |approved: bool| EventKind::ComponentAnswered {
            message_id: reply,
            component_id: approval.id,
            answer: serde_json::json!({ "approved": approved }),
        };
        let mut state = project.lock();
        let kinds = vec![
            started("refute"),
            completed("refute", "first critique"),
            started("refute"),
            completed("refute", "second critique"),
            EventKind::ComponentAdded { message_id: reply, component: approval.clone() },
            EventKind::MessagePaused { message_id: reply },
        ];
        state.persist_all(conversation, kinds, |_| Ok(())).unwrap();
        assert_eq!(state.message_place(reply).unwrap().unwrap().1, MessageStatus::Paused);

        state.persist(conversation, answered(true)).unwrap();
        state.persist(conversation, answered(false)).unwrap();
        state.persist(conversation, EventKind::MessageResumed { message_id: reply }).unwrap();

        let (_, message) = state.load_message(reply).unwrap().unwrap();
        assert_eq!(message.status, MessageStatus::Streaming);
        let outputs: Vec<Option<&str>> =
            message.steps.iter().map(|s| s.output.as_deref()).collect();
        assert_eq!(outputs, [Some("first critique"), Some("second critique")]);
        assert!(message.steps.iter().all(|s| s.done));
        assert_eq!(message.components[0].answer, serde_json::json!({ "approved": true }));
    }
}
