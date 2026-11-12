//! The event protocol shared by the UI, the Rust core and future producers.
//! `src/protocol/types.ts` mirrors these types; `src-tauri/fixtures/events.json` keeps both
//! sides in agreement.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const ENVELOPE_VERSION: u32 = 1;

pub fn new_id() -> Uuid {
    Uuid::now_v7()
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Origin {
    pub installation_id: Uuid,
    pub user_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub id: Uuid,
    pub v: u32,
    pub project_id: Uuid,
    pub conversation_id: Uuid,
    pub seq: i64,
    pub ts: i64,
    pub origin: Origin,
    #[serde(flatten)]
    pub kind: EventKind,
}

/// The event `type` and its `payload`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum EventKind {
    #[serde(rename = "message.created")]
    MessageCreated { message: Message },
    #[serde(rename = "message.delta")]
    MessageDelta { message_id: Uuid, text: String },
    #[serde(rename = "message.progress")]
    MessageProgress {
        message_id: Uuid,
        label: String,
        fraction: Option<f64>,
    },
    /// A streaming reply now waits for the user to answer an approval.
    #[serde(rename = "message.paused")]
    MessagePaused { message_id: Uuid },
    #[serde(rename = "message.resumed")]
    MessageResumed { message_id: Uuid },
    #[serde(rename = "message.completed")]
    MessageCompleted { message_id: Uuid, content: String },
    #[serde(rename = "message.failed")]
    MessageFailed { message_id: Uuid, error: ErrorInfo },
    #[serde(rename = "message.cancelled")]
    MessageCancelled { message_id: Uuid },
    #[serde(rename = "attachment.added")]
    AttachmentAdded { message_id: Uuid, asset: AssetRef },
    #[serde(rename = "component.added")]
    ComponentAdded {
        message_id: Uuid,
        component: Component,
    },
    #[serde(rename = "component.answered")]
    ComponentAnswered {
        message_id: Uuid,
        component_id: Uuid,
        answer: Value,
    },
    /// A Step of the reply's Workflow started. `name` is the Trait's name for a Trait Step,
    /// otherwise the Step's label or its type.
    #[serde(rename = "step.started")]
    StepStarted {
        message_id: Uuid,
        step_id: String,
        #[serde(rename = "type")]
        step_type: String,
        name: String,
    },
    /// The latest started run of `step_id` ended. `output` is a Trait Step's text, a
    /// condition's chosen branch, a loop's `repeat` or `stop`, or `null`.
    #[serde(rename = "step.completed")]
    StepCompleted {
        message_id: Uuid,
        step_id: String,
        output: Option<String>,
    },
    #[serde(rename = "reaction.added")]
    ReactionAdded {
        message_id: Uuid,
        emoji: String,
        by: Author,
    },
    #[serde(rename = "reaction.removed")]
    ReactionRemoved {
        message_id: Uuid,
        emoji: String,
        by: Author,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorInfo {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthorKind {
    User,
    MiniMe,
    System,
}

impl AuthorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            AuthorKind::User => "user",
            AuthorKind::MiniMe => "mini_me",
            AuthorKind::System => "system",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "user" => Some(AuthorKind::User),
            "mini_me" => Some(AuthorKind::MiniMe),
            "system" => Some(AuthorKind::System),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Author {
    pub kind: AuthorKind,
    pub id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageStatus {
    Streaming,
    Paused,
    Complete,
    Failed,
    Cancelled,
}

impl MessageStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            MessageStatus::Streaming => "streaming",
            MessageStatus::Paused => "paused",
            MessageStatus::Complete => "complete",
            MessageStatus::Failed => "failed",
            MessageStatus::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "streaming" => Some(MessageStatus::Streaming),
            "paused" => Some(MessageStatus::Paused),
            "complete" => Some(MessageStatus::Complete),
            "failed" => Some(MessageStatus::Failed),
            "cancelled" => Some(MessageStatus::Cancelled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Message {
    pub id: Uuid,
    pub author: Author,
    pub content: String,
    pub status: MessageStatus,
    #[serde(default)]
    pub reply_to: Option<Uuid>,
    #[serde(default)]
    pub attachments: Vec<AssetRef>,
    #[serde(default)]
    pub text_components: Vec<TextComponent>,
    pub components: Vec<Component>,
    /// The Steps of the reply's Workflow that have started, in order.
    pub steps: Vec<MessageStep>,
}

impl Message {
    /// A new message without attachments, references, components or Steps.
    pub fn new(author: Author, content: String, status: MessageStatus, reply_to: Option<Uuid>) -> Self {
        Self {
            id: new_id(),
            author,
            content,
            status,
            reply_to,
            attachments: Vec::new(),
            text_components: Vec::new(),
            components: Vec::new(),
            steps: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MessageStep {
    pub step_id: String,
    #[serde(rename = "type")]
    pub step_type: String,
    pub name: String,
    pub output: Option<String>,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetRef {
    pub id: Uuid,
    pub name: String,
    pub media_type: String,
    pub size_bytes: i64,
}

/// An Interactive Component shown below a reply's text. `data` matches the JSON Schema of
/// `kind` at `version` in the catalogue; `text` stands in for it wherever the kind is not
/// rendered, such as conversation history.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Component {
    pub id: Uuid,
    pub kind: String,
    pub version: u32,
    pub data: Value,
    pub text: String,
    /// The user's answer, for kinds that ask for one; `null` until answered.
    #[serde(default)]
    pub answer: Value,
    /// The position, from 0, in the reply's started Steps of the Step run whose Trait call
    /// added it; absent when no Trait Step added it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step_index: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextComponentKind {
    Asset,
    MiniMe,
    /// A `$` reference to a whole `table` or `chart` Interactive Component.
    Component,
}

/// An inline reference inside a message. `start` and `end` are UTF-16 code unit offsets into
/// the message content, because references are authored in the JavaScript composer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextComponent {
    pub kind: TextComponentKind,
    pub id: Uuid,
    pub label: String,
    pub start: u32,
    pub end: u32,
}

/// A message as the UI shows it: what its Conversation's events give when folded in order.
/// `src/protocol/eventStore.ts` builds the same shape from events; `src-tauri/fixtures/
/// replay.json` keeps the two in agreement.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MessageView {
    #[serde(flatten)]
    pub message: Message,
    /// When the message was created: its `message.created` event's `ts`, in milliseconds.
    pub created_at: i64,
    pub reactions: Vec<Reaction>,
    /// The latest progress of a streaming reply; `null` once it has ended or paused.
    pub progress: Option<Progress>,
    /// Why the reply failed, once it has.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<ErrorInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Reaction {
    pub emoji: String,
    pub by: Author,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Progress {
    pub label: String,
    pub fraction: Option<f64>,
}

/// A Conversation as it stands when the UI opens it. Events after `last_seq` reach the UI
/// through the subscription `subscription_id`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OpenedConversation {
    pub subscription_id: Uuid,
    pub last_seq: i64,
    pub messages: Vec<MessageView>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn the_fixture_events_round_trip() {
        let fixture: Vec<Value> =
            serde_json::from_str(include_str!("../fixtures/events.json")).unwrap();
        for original in fixture {
            let event: Event = serde_json::from_value(original.clone())
                .unwrap_or_else(|e| panic!("cannot parse {original}: {e}"));
            assert_eq!(serde_json::to_value(&event).unwrap(), original);
        }
    }
}
