//! The event protocol shared by the UI, the Rust core and future producers.
//! `src/protocol/types.ts` mirrors these types; `protocol/fixtures/events.json` keeps both
//! sides in agreement.

use serde::{Deserialize, Serialize};
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
    #[serde(rename = "message.completed")]
    MessageCompleted { message_id: Uuid, content: String },
    #[serde(rename = "message.failed")]
    MessageFailed { message_id: Uuid, error: ErrorInfo },
    #[serde(rename = "message.cancelled")]
    MessageCancelled { message_id: Uuid },
    #[serde(rename = "attachment.added")]
    AttachmentAdded { message_id: Uuid, asset: AssetRef },
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
    Complete,
    Failed,
    Cancelled,
}

impl MessageStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            MessageStatus::Streaming => "streaming",
            MessageStatus::Complete => "complete",
            MessageStatus::Failed => "failed",
            MessageStatus::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "streaming" => Some(MessageStatus::Streaming),
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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetRef {
    pub id: Uuid,
    pub name: String,
    pub media_type: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextComponentKind {
    Asset,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn envelope_serializes_to_spec_shape() {
        let event = Event {
            id: new_id(),
            v: ENVELOPE_VERSION,
            project_id: new_id(),
            conversation_id: new_id(),
            seq: 1,
            ts: 1_760_000_000_000,
            origin: Origin {
                installation_id: new_id(),
                user_id: new_id(),
            },
            kind: EventKind::MessageCancelled {
                message_id: new_id(),
            },
        };
        let value = serde_json::to_value(&event).unwrap();
        let object = value.as_object().unwrap();
        for field in [
            "id",
            "type",
            "v",
            "project_id",
            "conversation_id",
            "seq",
            "ts",
            "origin",
            "payload",
        ] {
            assert!(object.contains_key(field), "missing field {field}");
        }
        assert_eq!(value["type"], json!("message.cancelled"));
        assert_eq!(value["v"], json!(1));

        let back: Event = serde_json::from_value(value).unwrap();
        assert_eq!(back, event);
    }

    #[test]
    fn ids_are_v7_and_ordered() {
        let first = new_id();
        let second = new_id();
        assert_eq!(first.get_version_num(), 7);
        assert!(second > first);
    }

    #[test]
    fn fixture_round_trips_every_event_type() {
        let fixture: Vec<Value> =
            serde_json::from_str(include_str!("../../protocol/fixtures/events.json")).unwrap();
        let mut types: Vec<String> = Vec::new();
        for original in fixture {
            let event: Event = serde_json::from_value(original.clone())
                .unwrap_or_else(|e| panic!("cannot parse {original}: {e}"));
            assert_eq!(serde_json::to_value(&event).unwrap(), original);
            types.push(original["type"].as_str().unwrap().to_string());
        }
        for expected in [
            "message.created",
            "message.delta",
            "message.completed",
            "message.failed",
            "message.cancelled",
            "attachment.added",
            "reaction.added",
            "reaction.removed",
        ] {
            assert!(types.iter().any(|t| t == expected), "fixture lacks {expected}");
        }
    }
}
