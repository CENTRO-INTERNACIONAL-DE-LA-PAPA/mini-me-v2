//! An open Project: its database, the event log, and delivery to subscribers.
//!
//! One lock per Project covers seq assignment, the transaction and queuing, so events are queued
//! only once committed, in `seq` order; each subscription's thread delivers outside the lock.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::types::Type;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::Value;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::history::ComponentLabel;
use crate::routing::ShownComponent;
use crate::paths::ProjectPaths;
use crate::sync::locked;
use crate::protocol::{
    AssetRef, Author, AuthorKind, Component, ENVELOPE_VERSION, Event, EventKind,
    Message, MessageStatus, MessageStep, MessageView, OpenedConversation, Origin, Progress,
    Reaction, TextComponent, new_id, now_ms,
};

/// About one screen refresh, so a fast reply updates the UI at most once per frame.
pub const BATCH_WINDOW: Duration = Duration::from_millis(16);

/// Receives batches of consecutive events; returns `false` when the subscriber is gone.
pub trait EventSink: Send {
    fn send(&self, events: &[Event]) -> bool;
}

/// Dropping it ends the subscription and its delivery thread.
struct Subscription {
    id: Uuid,
    queue: Sender<Event>,
    active: Arc<AtomicBool>,
}

impl Drop for Subscription {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
    }
}

/// Sends each event with those within `BATCH_WINDOW` after it, until unsubscribed or a send fails.
fn deliver(queue: Receiver<Event>, active: Arc<AtomicBool>, sink: Box<dyn EventSink>) {
    while let Ok(first) = queue.recv() {
        let mut batch = vec![first];
        let deadline = Instant::now() + BATCH_WINDOW;
        while let Some(wait) = deadline.checked_duration_since(Instant::now()) {
            match queue.recv_timeout(wait) {
                Ok(event) => batch.push(event),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        if !active.load(Ordering::Acquire) || !sink.send(&batch) {
            return;
        }
    }
}

pub struct Project {
    pub id: Uuid,
    pub paths: ProjectPaths,
    inner: Mutex<ProjectState>,
}

pub struct ProjectState {
    pub conn: Connection,
    project_id: Uuid,
    origin: Origin,
    subscribers: HashMap<Uuid, Vec<Subscription>>,
}

impl Project {
    pub fn new(id: Uuid, paths: ProjectPaths, conn: Connection, origin: Origin) -> Self {
        Self {
            id,
            paths,
            inner: Mutex::new(ProjectState {
                conn,
                project_id: id,
                origin,
                subscribers: HashMap::new(),
            }),
        }
    }

    /// Stored in the database only; no folder is renamed. Returns the trimmed name.
    pub fn rename(&self, name: &str) -> AppResult<String> {
        let name = crate::projects::validate_name(name)?;
        self.lock().conn.execute("UPDATE project SET name = ?1", rusqlite::params![name])?;
        Ok(name)
    }

    pub fn lock(&self) -> MutexGuard<'_, ProjectState> {
        locked(&self.inner)
    }

    /// Stored events after `after_seq`, then new ones; queued under the lock, so none is missed.
    #[cfg(test)]
    pub fn subscribe(
        &self,
        conversation_id: Uuid,
        after_seq: i64,
        sink: Box<dyn EventSink>,
    ) -> AppResult<Uuid> {
        let mut state = self.lock();
        state.require_conversation(conversation_id)?;
        let stored = state.events_after(conversation_id, after_seq)?;
        state.add_subscription(conversation_id, stored, sink)
    }

    /// The stored Conversation and a subscription from there, read under the lock: none is missed.
    pub fn open(
        &self,
        conversation_id: Uuid,
        sink: Box<dyn EventSink>,
    ) -> AppResult<OpenedConversation> {
        let mut state = self.lock();
        state.require_conversation(conversation_id)?;
        let messages = state.message_views(conversation_id)?;
        let last_seq = state.last_seq(conversation_id)?;
        let subscription_id = state.add_subscription(conversation_id, Vec::new(), sink)?;
        Ok(OpenedConversation {
            subscription_id,
            last_seq,
            messages,
        })
    }

    /// An unknown ID is ignored.
    pub fn unsubscribe(&self, subscription_id: Uuid) {
        for subscriptions in self.lock().subscribers.values_mut() {
            subscriptions.retain(|s| s.id != subscription_id);
        }
    }

    /// Ends every subscription to the Project's Conversations.
    pub fn unsubscribe_all(&self) {
        self.lock().subscribers.clear();
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

    /// Queues `stored`, then starts the delivery thread; returns the subscription's ID.
    fn add_subscription(
        &mut self,
        conversation_id: Uuid,
        stored: Vec<Event>,
        sink: Box<dyn EventSink>,
    ) -> AppResult<Uuid> {
        let (queue, receiver) = mpsc::channel();
        for event in stored {
            // The receiver is still held here, so queuing cannot fail.
            let _ = queue.send(event);
        }
        let active = Arc::new(AtomicBool::new(true));
        let running = Arc::clone(&active);
        thread::Builder::new()
            .name("conversation-events".into())
            .spawn(move || deliver(receiver, running, sink))
            .map_err(|e| AppError::new("subscribe_failed", format!("Cannot deliver events: {e}")))?;
        let id = new_id();
        self.subscribers
            .entry(conversation_id)
            .or_default()
            .push(Subscription { id, queue, active });
        Ok(id)
    }

    fn last_seq(&self, conversation_id: Uuid) -> AppResult<i64> {
        Ok(self.conn.query_row(
            "SELECT last_seq FROM conversations WHERE id = ?1",
            params![conversation_id.to_string()],
            |row| row.get(0),
        )?)
    }

    #[cfg(test)]
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

    /// Stores the event and its projection in one transaction, and only then queues it.
    pub fn persist(&mut self, conversation_id: Uuid, kind: EventKind) -> AppResult<Event> {
        let mut events = self.persist_all(conversation_id, vec![kind], |_| Ok(()))?;
        Ok(events.remove(0))
    }

    /// Stores `kinds`, their projections and `also`'s writes in one transaction, then queues them.
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

        // Never waits on a subscriber; a queue whose thread has ended is dropped.
        if let Some(subscriptions) = self.subscribers.get_mut(&conversation_id) {
            subscriptions.retain(|s| events.iter().all(|e| s.queue.send(e.clone()).is_ok()));
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
        let conversation = parse_id(&conversation, "message")?;
        let status = MessageStatus::parse(&status).ok_or_else(|| unreadable("message"))?;
        Ok(Some((conversation, status)))
    }

    /// A message with all of its components' data.
    #[cfg(test)]
    pub fn load_message(&self, message_id: Uuid) -> AppResult<Option<(Uuid, Message)>> {
        self.load_message_with(message_id, true)
    }

    /// Components' `data` is `null` unless `component_data` is set; `text` is always read.
    pub fn load_message_with(
        &self,
        message_id: Uuid,
        component_data: bool,
    ) -> AppResult<Option<(Uuid, Message)>> {
        Ok(self.messages_in(Scope::Message(message_id), component_data)?.into_iter().next())
    }

    /// `scope`'s messages in creation order, with components (`data` if asked) and Steps.
    fn messages_in(&self, scope: Scope, component_data: bool) -> AppResult<Vec<(Uuid, Message)>> {
        let mut components = self.components_in(scope, component_data)?;
        let mut steps = self.steps_in(scope)?;
        let mut stmt = self.conn.prepare(&format!(
            "SELECT m.id, m.conversation_id, m.author_kind, m.author_id, m.content, m.status, \
             m.reply_to, m.attachments, m.text_components FROM messages m WHERE {} \
             ORDER BY m.rowid",
            scope.condition()
        ))?;
        let rows = stmt.query_map(params![scope.id()], |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                conversation: row.get(1)?,
                author_kind: row.get(2)?,
                author_id: row.get(3)?,
                content: row.get(4)?,
                status: row.get(5)?,
                reply_to: row.get(6)?,
                attachments: row.get(7)?,
                text_components: row.get(8)?,
            })
        })?;
        let mut messages = Vec::new();
        for row in rows {
            let row = row?;
            let id = parse_id(&row.id, "message")?;
            let message = Message {
                id,
                author: Author {
                    kind: AuthorKind::parse(&row.author_kind).ok_or_else(|| unreadable("message"))?,
                    id: row.author_id,
                },
                content: row.content,
                status: MessageStatus::parse(&row.status).ok_or_else(|| unreadable("message"))?,
                reply_to: row.reply_to.map(|id| parse_id(&id, "message")).transpose()?,
                attachments: serde_json::from_str::<Vec<AssetRef>>(&row.attachments)?,
                text_components: serde_json::from_str::<Vec<TextComponent>>(&row.text_components)?,
                components: components.remove(&id).unwrap_or_default(),
                steps: steps.remove(&id).unwrap_or_default(),
            };
            messages.push((parse_id(&row.conversation, "message")?, message));
        }
        Ok(messages)
    }

    /// By message, in the order added; `preview` is `null` unless `with_preview` is set.
    fn components_in(
        &self,
        scope: Scope,
        with_preview: bool,
    ) -> AppResult<HashMap<Uuid, Vec<Component>>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT c.message_id, {} FROM components c \
             JOIN messages m ON m.id = c.message_id WHERE {} ORDER BY c.rowid",
            component_columns(with_preview),
            scope.condition(),
        ))?;
        let rows = stmt.query_map(params![scope.id()], |row| {
            Ok((row.get::<_, String>(0)?, ComponentRow::read(row, 1)?))
        })?;
        let mut components: HashMap<Uuid, Vec<Component>> = HashMap::new();
        for row in rows {
            let (message_id, raw) = row?;
            let message_id = parse_id(&message_id, "component")?;
            components.entry(message_id).or_default().push(raw.into_component()?);
        }
        Ok(components)
    }

    /// Started Steps by message, in order.
    fn steps_in(&self, scope: Scope) -> AppResult<HashMap<Uuid, Vec<MessageStep>>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT s.message_id, s.step_id, s.type, s.name, s.output, s.done, s.show_results \
             FROM message_steps s JOIN messages m ON m.id = s.message_id WHERE {} \
             ORDER BY s.message_id, s.position",
            scope.condition()
        ))?;
        let rows = stmt.query_map(params![scope.id()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                MessageStep {
                    step_id: row.get(1)?,
                    step_type: row.get(2)?,
                    name: row.get(3)?,
                    output: row.get(4)?,
                    done: row.get(5)?,
                    show_results: row.get(6)?,
                },
            ))
        })?;
        let mut steps: HashMap<Uuid, Vec<MessageStep>> = HashMap::new();
        for row in rows {
            let (message_id, step) = row?;
            let message_id = parse_id(&message_id, "Step")?;
            steps.entry(message_id).or_default().push(step);
        }
        Ok(steps)
    }

    /// 0-based index of `step_id`'s latest run among started Steps; `None` if it has not started.
    pub fn latest_step_index(&self, message_id: Uuid, step_id: &str) -> AppResult<Option<u32>> {
        let position: Option<u32> = self.conn.query_row(
            "SELECT MAX(position) FROM message_steps WHERE message_id = ?1 AND step_id = ?2",
            params![message_id.to_string(), step_id],
            |row| row.get(0),
        )?;
        Ok(position.map(|p| p - 1))
    }

    /// `None` unless a message of the Conversation holds it.
    pub fn conversation_component(
        &self,
        conversation_id: Uuid,
        component_id: Uuid,
    ) -> AppResult<Option<Component>> {
        let raw = self
            .conn
            .query_row(
                &format!(
                    "SELECT {} FROM components c JOIN messages m ON m.id = c.message_id \
                     WHERE m.conversation_id = ?1 AND c.id = ?2",
                    component_columns(true),
                ),
                params![conversation_id.to_string(), component_id.to_string()],
                |row| ComponentRow::read(row, 0),
            )
            .optional()?;
        raw.map(ComponentRow::into_component).transpose()
    }

    /// Each component's title and source file name, for its line in the history; reads no other
    /// part of its preview.
    pub fn component_labels(
        &self,
        conversation_id: Uuid,
    ) -> AppResult<HashMap<Uuid, ComponentLabel>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, json_extract(c.preview, '$.title'), a.name \
             FROM components c JOIN messages m ON m.id = c.message_id \
             LEFT JOIN assets a ON a.id = c.source_asset_id WHERE m.conversation_id = ?1",
        )?;
        let rows = stmt.query_map(params![conversation_id.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?;
        let mut labels = HashMap::new();
        for row in rows {
            let (id, title, source) = row?;
            let title = title.filter(|t| !t.trim().is_empty());
            labels.insert(
                parse_id(&id, "component")?,
                ComponentLabel { title, source },
            );
        }
        Ok(labels)
    }

    /// The Conversation's tables and charts, newest first; reads no other part of their preview.
    pub fn shown_components(&self, conversation_id: Uuid) -> AppResult<Vec<ShownComponent>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.kind, json_extract(c.preview, '$.title'), a.id, a.name \
             FROM components c JOIN messages m ON m.id = c.message_id \
             JOIN assets a ON a.id = c.source_asset_id \
             WHERE m.conversation_id = ?1 AND c.kind IN ('table', 'chart') ORDER BY c.rowid DESC",
        )?;
        let rows = stmt.query_map(params![conversation_id.to_string()], |row| {
            let uuid = |column: usize| {
                let text: String = row.get(column)?;
                Uuid::parse_str(&text).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(column, Type::Text, Box::new(e))
                })
            };
            Ok(ShownComponent {
                id: uuid(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                source_id: uuid(3)?,
                source_name: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Replaces the message's only debug record of `kind`.
    pub fn put_debug_record(
        &self,
        conversation_id: Uuid,
        message_id: Uuid,
        kind: &str,
        content: &Value,
    ) -> AppResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO debug_records \
             (message_id, kind, position, conversation_id, content, created_at) \
             VALUES (?1, ?2, 0, ?3, ?4, ?5)",
            params![
                message_id.to_string(),
                kind,
                conversation_id.to_string(),
                content.to_string(),
                now_ms()
            ],
        )?;
        Ok(())
    }

    pub fn append_debug_record(
        &self,
        conversation_id: Uuid,
        message_id: Uuid,
        kind: &str,
        content: &Value,
    ) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO debug_records \
             (message_id, kind, position, conversation_id, content, created_at) \
             SELECT ?1, ?2, COALESCE(MAX(position) + 1, 0), ?3, ?4, ?5 FROM debug_records \
             WHERE message_id = ?1 AND kind = ?2",
            params![
                message_id.to_string(),
                kind,
                conversation_id.to_string(),
                content.to_string(),
                now_ms()
            ],
        )?;
        Ok(())
    }

    /// In the order they were written.
    pub fn debug_records(&self, message_id: Uuid, kind: &str) -> AppResult<Vec<Value>> {
        let mut statement = self.conn.prepare(
            "SELECT content FROM debug_records WHERE message_id = ?1 AND kind = ?2 \
             ORDER BY position",
        )?;
        let rows = statement.query_map(params![message_id.to_string(), kind], |row| {
            row.get::<_, String>(0)
        })?;
        let mut records = Vec::new();
        for content in rows {
            records.push(serde_json::from_str(&content?)?);
        }
        Ok(records)
    }

    pub fn clear_debug_records(&self) -> AppResult<()> {
        self.conn.execute("DELETE FROM debug_records", [])?;
        Ok(())
    }

    pub fn streaming_messages(&self, conversation_id: Option<Uuid>) -> AppResult<Vec<MessageAt>> {
        self.messages_with_status(&[MessageStatus::Streaming], conversation_id)
    }

    pub fn messages_with_status(
        &self,
        statuses: &[MessageStatus],
        conversation_id: Option<Uuid>,
    ) -> AppResult<Vec<MessageAt>> {
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
            result.push(MessageAt {
                conversation: parse_id(&conversation, "ID")?,
                message: parse_id(&message, "ID")?,
            });
        }
        Ok(result)
    }

    /// In creation order; components carry only `text`, which is all a history needs.
    pub fn conversation_messages(&self, conversation_id: Uuid) -> AppResult<Vec<Message>> {
        let messages = self.messages_in(Scope::Conversation(conversation_id), false)?;
        Ok(messages.into_iter().map(|(_, message)| message).collect())
    }

    /// Messages as the UI shows them, including what only events record; must match the fold in
    /// `src/protocol/eventStore.ts`.
    fn message_views(&self, conversation_id: Uuid) -> AppResult<Vec<MessageView>> {
        let messages = self.messages_in(Scope::Conversation(conversation_id), true)?;
        let created: HashMap<String, i64> = self
            .conn
            .prepare("SELECT id, created_at FROM messages WHERE conversation_id = ?1")?
            .query_map(params![conversation_id.to_string()], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<_, _>>()?;
        let mut views: Vec<MessageView> = messages
            .into_iter()
            .map(|(_, message)| MessageView {
                created_at: created.get(&message.id.to_string()).copied().unwrap_or_default(),
                message,
                reactions: Vec::new(),
                progress: None,
                failure: None,
            })
            .collect();
        let index: HashMap<Uuid, usize> =
            views.iter().enumerate().map(|(i, v)| (v.message.id, i)).collect();

        // A re-added reaction is a new row, so `rowid` order is the UI's order.
        let mut stmt = self.conn.prepare(
            "SELECT r.message_id, r.emoji, r.by_kind, r.by_id FROM reactions r \
             JOIN messages m ON m.id = r.message_id WHERE m.conversation_id = ?1 \
             ORDER BY r.rowid",
        )?;
        let rows = stmt.query_map(params![conversation_id.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        for row in rows {
            let (message_id, emoji, kind, by_id) = row?;
            let message_id = parse_id(&message_id, "reaction")?;
            let by = Author {
                kind: AuthorKind::parse(&kind).ok_or_else(|| unreadable("reaction"))?,
                id: by_id,
            };
            if let Some(&i) = index.get(&message_id) {
                views[i].reactions.push(Reaction { emoji, by });
            }
        }

        let mut stmt = self.conn.prepare(
            "SELECT body FROM events WHERE conversation_id = ?1 AND type IN \
             ('message.failed', 'message.progress', 'message.paused', 'message.resumed') \
             ORDER BY seq",
        )?;
        let bodies = stmt.query_map(params![conversation_id.to_string()], |row| {
            row.get::<_, String>(0)
        })?;
        let mut paused = HashSet::new();
        for body in bodies {
            let event: Event = serde_json::from_str(&body?)?;
            let view = |id: &Uuid| index.get(id).copied();
            match event.kind {
                EventKind::MessageFailed { message_id, error } => {
                    if let Some(i) = view(&message_id) {
                        views[i].failure = Some(error);
                    }
                }
                // Progress stays empty after resuming until the next progress event.
                EventKind::MessagePaused { message_id } => {
                    paused.insert(message_id);
                    if let Some(i) = view(&message_id) {
                        views[i].progress = None;
                    }
                }
                EventKind::MessageResumed { message_id } => {
                    paused.remove(&message_id);
                }
                EventKind::MessageProgress { message_id, label, fraction } => {
                    if let Some(i) = view(&message_id).filter(|_| !paused.contains(&message_id)) {
                        views[i].progress = Some(Progress { label, fraction });
                    }
                }
                _ => {}
            }
        }
        // Progress is shown only while a reply streams.
        for view in &mut views {
            if view.message.status != MessageStatus::Streaming {
                view.progress = None;
            }
        }
        Ok(views)
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

/// The messages a read covers: one message, or every message of a Conversation.
#[derive(Clone, Copy)]
enum Scope {
    Message(Uuid),
    Conversation(Uuid),
}

impl Scope {
    /// The condition on the `messages` row `m` that selects the scope, with its ID as `?1`.
    fn condition(self) -> &'static str {
        match self {
            Scope::Message(_) => "m.id = ?1",
            Scope::Conversation(_) => "m.conversation_id = ?1",
        }
    }

    fn id(self) -> String {
        match self {
            Scope::Message(id) | Scope::Conversation(id) => id.to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MessageAt {
    pub conversation: Uuid,
    pub message: Uuid,
}

struct MessageRow {
    id: String,
    conversation: String,
    author_kind: String,
    author_id: String,
    content: String,
    status: String,
    reply_to: Option<String>,
    attachments: String,
    text_components: String,
}

/// `preview` reads as `null` unless `with_preview` is set.
fn component_columns(with_preview: bool) -> String {
    let preview = if with_preview { "c.preview" } else { "'null'" };
    format!("c.id, c.kind, c.version, {preview}, c.text, c.answer, c.step_index, c.source_asset_id")
}

struct ComponentRow {
    id: String,
    kind: String,
    version: u32,
    preview: String,
    text: String,
    answer: Option<String>,
    step_index: Option<u32>,
    source_asset_id: Option<String>,
}

impl ComponentRow {
    /// Reads `component_columns` starting at column `first`.
    fn read(row: &rusqlite::Row<'_>, first: usize) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(first)?,
            kind: row.get(first + 1)?,
            version: row.get(first + 2)?,
            preview: row.get(first + 3)?,
            text: row.get(first + 4)?,
            answer: row.get(first + 5)?,
            step_index: row.get(first + 6)?,
            source_asset_id: row.get(first + 7)?,
        })
    }

    fn into_component(self) -> AppResult<Component> {
        Ok(Component {
            id: parse_id(&self.id, "component")?,
            kind: self.kind,
            version: self.version,
            preview: serde_json::from_str(&self.preview)?,
            text: self.text,
            source_asset_id: self
                .source_asset_id
                .as_deref()
                .map(|id| parse_id(id, "component"))
                .transpose()?,
            answer: self.answer.map(|a| serde_json::from_str(&a)).transpose()?.unwrap_or_default(),
            step_index: self.step_index,
        })
    }
}

pub(crate) fn unreadable(what: &str) -> AppError {
    AppError::storage(format!("stored {what} is not readable"))
}

pub(crate) fn parse_id(value: &str, what: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value).map_err(|_| unreadable(what))
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
        // No projection: `message_views` reads progress from the events.
        EventKind::MessageProgress { .. } => {}
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
        EventKind::StepStarted { message_id, step_id, step_type, name, show_results } => {
            tx.execute(
                "INSERT INTO message_steps (message_id, position, step_id, type, name, \
                 show_results) SELECT ?1, COALESCE(MAX(position), 0) + 1, ?2, ?3, ?4, ?5 \
                 FROM message_steps WHERE message_id = ?1",
                params![message_id.to_string(), step_id, step_type, name, show_results],
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
                "INSERT INTO components \
                 (id, message_id, kind, version, preview, text, step_index, created_at, \
                 source_asset_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    component.id.to_string(),
                    message_id.to_string(),
                    component.kind,
                    component.version,
                    serde_json::to_string(&component.preview)?,
                    component.text,
                    component.step_index,
                    event.ts,
                    component.source_asset_id.map(|id| id.to_string())
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

    /// Collects delivered batches for assertions.
    #[derive(Clone, Default)]
    pub struct Collector(pub Arc<Mutex<Vec<Vec<Event>>>>);

    impl Collector {
        /// Every event delivered so far, across batches.
        pub fn events(&self) -> Vec<Event> {
            self.0.lock().unwrap().concat()
        }

        /// Waits for `count` events and a few quiet batch windows; panics after two seconds.
        pub fn settled(&self, count: usize) -> Vec<Event> {
            let start = std::time::Instant::now();
            while self.events().len() < count {
                assert!(start.elapsed() < Duration::from_secs(2), "fewer than {count} events");
                thread::sleep(Duration::from_millis(5));
            }
            thread::sleep(BATCH_WINDOW * 4);
            self.events()
        }
    }

    impl EventSink for Collector {
        fn send(&self, events: &[Event]) -> bool {
            self.0.lock().unwrap().push(events.to_vec());
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
        thread::sleep(BATCH_WINDOW * 4);
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

        let seqs: Vec<i64> = collector.settled(3).iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![3, 4, 5]);

        let collector = Collector::default();
        let opened = project.open(conversation, Box::new(collector.clone())).unwrap();
        assert_eq!(opened.last_seq, 5);
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        let seqs: Vec<i64> = collector.settled(1).iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![6]);
    }

    /// Takes the Project lock on delivery, so it deadlocks if delivery runs under that lock.
    struct Locking(Arc<Project>, Collector);

    impl EventSink for Locking {
        fn send(&self, events: &[Event]) -> bool {
            drop(self.0.lock());
            self.1.send(events)
        }
    }

    #[test]
    fn delivery_does_not_hold_the_project_lock() {
        let (_dir, project) = temp_project();
        let project = Arc::new(project);
        let conversation = conversations::create(&project).unwrap().id;
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        let collector = Collector::default();
        let sink = Locking(Arc::clone(&project), collector.clone());
        project.subscribe(conversation, 0, Box::new(sink)).unwrap();
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        assert_eq!(collector.settled(2).len(), 2);
    }

    #[test]
    fn opening_matches_the_replay_fixture() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/replay.json")).unwrap();
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        {
            let mut state = project.lock();
            for event in fixture["events"].as_array().unwrap() {
                let event: Event = serde_json::from_value(event.clone()).unwrap();
                state.persist(conversation, event.kind).unwrap();
            }
        }
        let opened = project.open(conversation, Box::new(Collector::default())).unwrap();
        let mut opened = serde_json::to_value(&opened).unwrap();
        assert_eq!(opened["last_seq"], fixture["opened"]["lastSeq"]);
        // Persisting stamps the current time, so `created_at` is only checked for presence.
        let mut expected = fixture["opened"]["messages"].clone();
        for list in [&mut opened["messages"], &mut expected] {
            for message in list.as_array_mut().unwrap() {
                let created_at = message.as_object_mut().unwrap().remove("created_at");
                assert!(created_at.is_some_and(|t| t.is_i64()));
            }
        }
        assert_eq!(opened["messages"], expected);
    }
}
