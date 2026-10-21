//! An open Project: its database, the event log, and delivery to subscribers.
//!
//! One lock per Project covers sequence assignment, the database transaction and queuing
//! events for subscribers, so events are queued only after they are committed, and always in
//! `seq` order. Each subscription's own thread sends its queue to the UI, outside the lock.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::paths::ProjectPaths;
use crate::protocol::{
    AssetRef, Author, AuthorKind, Component, ENVELOPE_VERSION, Event, EventKind, JevAnswers,
    Message, MessageStatus, MessageStep, MessageView, OpenedConversation, Origin, Progress,
    Reaction, TextComponent, new_id, now_ms,
};

/// How long a subscription gathers events before delivering them as one batch: about one
/// screen refresh, so a fast reply updates the UI at most once per frame.
pub const BATCH_WINDOW: Duration = Duration::from_millis(16);

/// Receives delivered events, in batches of consecutive events. Returns `false` when the
/// subscriber is gone and should be dropped.
pub trait EventSink: Send {
    fn send(&self, events: &[Event]) -> bool;
}

/// A subscriber's queue, which its delivery thread sends to the subscriber's sink. Dropping
/// it ends the subscription: the thread delivers nothing more, then ends.
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

/// A subscription's delivery thread: waits for an event, gathers what follows it within
/// `BATCH_WINDOW`, and sends them together, until the subscription ends or a send fails.
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
    pub name: String,
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

    /// Delivers every stored event after `after_seq`, then every new event, and returns the
    /// subscription's ID. Both are queued under the Project lock, so no event is missed or
    /// duplicated.
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

    /// The Conversation as stored, and a subscription that delivers every event persisted
    /// after it. Both are read under the Project lock, so no event is missed or duplicated.
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

    /// Ends a subscription, whatever its Conversation; an unknown ID is ignored.
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

    /// Queues `stored` for `sink`, then starts the thread that delivers the subscription's
    /// queue, and returns its ID.
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

    #[cfg(test)]
    fn subscription_count(&self) -> usize {
        self.subscribers.values().map(Vec::len).sum()
    }

    fn last_seq(&self, conversation_id: Uuid) -> AppResult<i64> {
        Ok(self.conn.query_row(
            "SELECT last_seq FROM conversations WHERE id = ?1",
            params![conversation_id.to_string()],
            |row| row.get(0),
        )?)
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
    /// transaction, and only then queues it for delivery.
    pub fn persist(&mut self, conversation_id: Uuid, kind: EventKind) -> AppResult<Event> {
        let mut events = self.persist_all(conversation_id, vec![kind], |_| Ok(()))?;
        Ok(events.remove(0))
    }

    /// Stores `kinds` as consecutive events, their projections and whatever `also` writes,
    /// all in one transaction, then queues the events for delivery in order.
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

        // Queuing never waits on a subscriber. A queue whose thread has ended refuses the
        // event, and its subscription is dropped.
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
        Ok(self.messages_in(Scope::Message(message_id), component_data)?.into_iter().next())
    }

    /// The messages of `scope` with their Conversation, in the order they were created, with
    /// their components and Steps; components carry `data` only when `component_data` is set
    /// (`null` instead). Three queries, whatever the number of messages.
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
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })?;
        let corrupt = || AppError::storage("stored message is not readable");
        let mut messages = Vec::new();
        for row in rows {
            let (id, conversation, kind, author_id, content, status, reply_to, attachments, refs) =
                row?;
            let id = Uuid::parse_str(&id).map_err(|_| corrupt())?;
            let message = Message {
                id,
                author: Author {
                    kind: AuthorKind::parse(&kind).ok_or_else(corrupt)?,
                    id: author_id,
                },
                content,
                status: MessageStatus::parse(&status).ok_or_else(corrupt)?,
                reply_to: reply_to
                    .map(|id| Uuid::parse_str(&id))
                    .transpose()
                    .map_err(|_| corrupt())?,
                attachments: serde_json::from_str::<Vec<AssetRef>>(&attachments)?,
                text_components: serde_json::from_str::<Vec<TextComponent>>(&refs)?,
                components: components.remove(&id).unwrap_or_default(),
                steps: steps.remove(&id).unwrap_or_default(),
            };
            messages.push((Uuid::parse_str(&conversation).map_err(|_| corrupt())?, message));
        }
        Ok(messages)
    }

    /// The Interactive Components of `scope`'s messages by message, each message's in the
    /// order they were added; with `data` `null` unless `with_data` is set.
    fn components_in(
        &self,
        scope: Scope,
        with_data: bool,
    ) -> AppResult<HashMap<Uuid, Vec<Component>>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT c.message_id, {} FROM components c \
             JOIN messages m ON m.id = c.message_id WHERE {} ORDER BY c.rowid",
            component_columns(with_data),
            scope.condition(),
        ))?;
        let rows = stmt.query_map(params![scope.id()], |row| {
            Ok((row.get::<_, String>(0)?, component_row(row, 1)?))
        })?;
        let mut components: HashMap<Uuid, Vec<Component>> = HashMap::new();
        for row in rows {
            let (message_id, raw) = row?;
            let message_id = Uuid::parse_str(&message_id)
                .map_err(|_| AppError::storage("stored component is not readable"))?;
            components.entry(message_id).or_default().push(component(raw)?);
        }
        Ok(components)
    }

    /// The Steps each of `scope`'s replies has started, by message, in order.
    fn steps_in(&self, scope: Scope) -> AppResult<HashMap<Uuid, Vec<MessageStep>>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT s.message_id, s.step_id, s.type, s.name, s.output, s.done \
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
                },
            ))
        })?;
        let mut steps: HashMap<Uuid, Vec<MessageStep>> = HashMap::new();
        for row in rows {
            let (message_id, step) = row?;
            let message_id = Uuid::parse_str(&message_id)
                .map_err(|_| AppError::storage("stored Step is not readable"))?;
            steps.entry(message_id).or_default().push(step);
        }
        Ok(steps)
    }

    /// The Interactive Component `component_id` with its data, when a message of the
    /// Conversation holds it.
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
                |row| component_row(row, 0),
            )
            .optional()?;
        raw.map(component).transpose()
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
        let messages = self.messages_in(Scope::Conversation(conversation_id), false)?;
        Ok(messages.into_iter().map(|(_, message)| message).collect())
    }

    /// Every message of the Conversation as the UI shows it, in the order they were created:
    /// the stored messages with their components' data and reactions, plus the failures,
    /// Jev's answers and progress that only events record. Matches what folding the
    /// Conversation's events gives (`src/protocol/eventStore.ts`).
    fn message_views(&self, conversation_id: Uuid) -> AppResult<Vec<MessageView>> {
        let messages = self.messages_in(Scope::Conversation(conversation_id), true)?;
        let mut views: Vec<MessageView> = messages
            .into_iter()
            .map(|(_, message)| MessageView {
                message,
                reactions: Vec::new(),
                progress: None,
                jev: None,
                failure: None,
            })
            .collect();
        let index: HashMap<Uuid, usize> =
            views.iter().enumerate().map(|(i, v)| (v.message.id, i)).collect();

        // A reaction removed and added again is a new row, so `rowid` order is the order in
        // which the UI adds them.
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
            let corrupt = || AppError::storage("stored reaction is not readable");
            let message_id = Uuid::parse_str(&message_id).map_err(|_| corrupt())?;
            let by = Author {
                kind: AuthorKind::parse(&kind).ok_or_else(corrupt)?,
                id: by_id,
            };
            if let Some(&i) = index.get(&message_id) {
                views[i].reactions.push(Reaction { emoji, by });
            }
        }

        let mut stmt = self.conn.prepare(
            "SELECT body FROM events WHERE conversation_id = ?1 AND type IN \
             ('message.failed', 'routing.answered', 'message.progress', 'message.paused', \
             'message.resumed') ORDER BY seq",
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
                EventKind::RoutingAnswered { message_id, answers, error } => {
                    if let Some(i) = view(&message_id) {
                        views[i].jev = Some(JevAnswers { answers, error });
                    }
                }
                // Pausing clears a reply's progress; it stays empty after resuming until the
                // next progress event.
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

/// The columns of a `components` row `c` that `component_row` reads; `data` reads as `null`
/// unless `with_data` is set.
fn component_columns(with_data: bool) -> String {
    let data = if with_data { "c.data" } else { "'null'" };
    format!("c.id, c.kind, c.version, {data}, c.text, c.answer")
}

/// The raw `component_columns`, starting at column `first`.
type ComponentRow = (String, String, u32, String, String, Option<String>);

fn component_row(row: &rusqlite::Row<'_>, first: usize) -> rusqlite::Result<ComponentRow> {
    Ok((
        row.get(first)?,
        row.get(first + 1)?,
        row.get(first + 2)?,
        row.get(first + 3)?,
        row.get(first + 4)?,
        row.get(first + 5)?,
    ))
}

fn component((id, kind, version, data, text, answer): ComponentRow) -> AppResult<Component> {
    Ok(Component {
        id: Uuid::parse_str(&id)
            .map_err(|_| AppError::storage("stored component is not readable"))?,
        kind,
        version,
        data: serde_json::from_str(&data)?,
        text,
        answer: answer.map(|a| serde_json::from_str(&a)).transpose()?.unwrap_or_default(),
    })
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
        // Progress and Jev's answers have no projection: opening a Conversation reads them
        // from their events (`message_views`), as it does a failure's details.
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

    /// Collects delivered batches for assertions.
    #[derive(Clone, Default)]
    pub struct Collector(pub Arc<Mutex<Vec<Vec<Event>>>>);

    impl Collector {
        /// Every event delivered so far, across batches.
        pub fn events(&self) -> Vec<Event> {
            self.0.lock().unwrap().concat()
        }

        pub fn batches(&self) -> Vec<Vec<Event>> {
            self.0.lock().unwrap().clone()
        }

        /// The delivered events, once at least `count` arrived and no more followed within a
        /// few batch windows; panics after two seconds without `count`.
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
    }

    #[test]
    fn events_persisted_together_arrive_as_one_batch() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        let collector = Collector::default();
        project.subscribe(conversation, 0, Box::new(collector.clone())).unwrap();
        let kinds = (0..5).map(|_| cancel(new_id())).collect();
        project.lock().persist_all(conversation, kinds, |_| Ok(())).unwrap();

        assert_eq!(collector.settled(5).len(), 5);
        let sizes: Vec<usize> = collector.batches().iter().map(Vec::len).collect();
        assert_eq!(sizes, vec![5]);
    }

    /// Refuses every batch, as a closed UI channel does.
    struct Gone;

    impl EventSink for Gone {
        fn send(&self, _: &[Event]) -> bool {
            false
        }
    }

    #[test]
    fn a_subscriber_that_is_gone_is_dropped() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        project.subscribe(conversation, 0, Box::new(Gone)).unwrap();
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        // The refused batch ends the delivery thread; the next event finds its queue closed.
        thread::sleep(BATCH_WINDOW * 4);
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        assert_eq!(project.lock().subscription_count(), 0);
    }

    /// Takes the Project lock on every delivery, which would deadlock if delivery ran under
    /// that lock.
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
    fn an_ended_subscription_receives_nothing_more() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        let (first, second) = (Collector::default(), Collector::default());
        let id = project.subscribe(conversation, 0, Box::new(first.clone())).unwrap();
        project.subscribe(conversation, 0, Box::new(second.clone())).unwrap();
        project.unsubscribe(id);
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        assert_eq!(second.settled(1).len(), 1);
        assert!(first.events().is_empty());

        project.unsubscribe_all();
        assert_eq!(project.lock().subscription_count(), 0);
    }

    #[test]
    fn opening_delivers_only_events_persisted_after_it() {
        let (_dir, project) = temp_project();
        let conversation = conversations::create(&project).unwrap().id;
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        let collector = Collector::default();
        let opened = project.open(conversation, Box::new(collector.clone())).unwrap();
        assert_eq!(opened.last_seq, 1);
        project.lock().persist(conversation, cancel(new_id())).unwrap();
        let seqs: Vec<i64> = collector.settled(1).iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![2]);
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
        let opened = serde_json::to_value(&opened).unwrap();
        assert_eq!(opened["last_seq"], fixture["opened"]["lastSeq"]);
        assert_eq!(opened["messages"], fixture["opened"]["messages"]);
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

        let other = conversations::create(&project).unwrap().id;
        let state = project.lock();
        assert_eq!(state.conversation_component(other, first.id).unwrap(), None);
        assert_eq!(state.conversation_component(conversation, first.id).unwrap(), Some(first));
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
