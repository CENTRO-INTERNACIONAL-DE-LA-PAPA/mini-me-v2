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
    AssetRef, Author, AuthorKind, ENVELOPE_VERSION, Event, EventKind, Message, MessageStatus,
    Origin, TextComponent, new_id, now_ms,
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
        let last_seq: i64 = self
            .conn
            .query_row(
                "SELECT last_seq FROM conversations WHERE id = ?1",
                params![conversation_id.to_string()],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::not_found("Conversation not found"))?;

        let event = Event {
            id: new_id(),
            v: ENVELOPE_VERSION,
            project_id: self.project_id,
            conversation_id,
            seq: last_seq + 1,
            ts: now_ms(),
            origin: self.origin,
            kind,
        };
        let body = serde_json::to_string(&event)?;
        let type_name = serde_json::to_value(&event)?["type"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        let tx = self.conn.transaction()?;
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
        tx.execute(
            "UPDATE conversations SET last_seq = ?2, last_activity_at = ?3 WHERE id = ?1",
            params![conversation_id.to_string(), event.seq, event.ts],
        )?;
        tx.commit()?;

        if let Some(sinks) = self.subscribers.get_mut(&conversation_id) {
            sinks.retain(|sink| sink.send(&event));
        }
        Ok(event)
    }

    pub fn load_message(&self, message_id: Uuid) -> AppResult<Option<(Uuid, Message)>> {
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
        };
        let conversation = Uuid::parse_str(&conversation).map_err(|_| corrupt())?;
        Ok(Some((conversation, message)))
    }

    /// IDs of messages still streaming, optionally limited to one Conversation.
    pub fn streaming_messages(&self, conversation_id: Option<Uuid>) -> AppResult<Vec<(Uuid, Uuid)>> {
        let mut stmt = self.conn.prepare(
            "SELECT conversation_id, id FROM messages WHERE status = 'streaming' \
             AND (?1 IS NULL OR conversation_id = ?1)",
        )?;
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
}
