//! Frames of the link between the Rust core and the sidecar: one JSON object per line, each
//! with a `type`. `sidecar/src/mini_me_sidecar` speaks the same frames, and
//! `protocol/fixtures/sidecar-frames.json` holds one example of each.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::protocol::{ErrorInfo, Message};

/// The link protocol version. Both sides must report the same number.
pub const SIDECAR_PROTOCOL: u32 = 1;

pub const REDACTED: &str = "[redacted]";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TraitInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(default)]
    pub providers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CallContext {
    pub project_id: Uuid,
    pub conversation_id: Uuid,
    pub message: Message,
}

/// Frames the core sends to the sidecar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CoreFrame {
    #[serde(rename = "traits.list")]
    TraitsList {},
    #[serde(rename = "ping")]
    Ping { nonce: String },
    #[serde(rename = "shutdown")]
    Shutdown {},
    #[serde(rename = "call.start")]
    CallStart {
        call_id: Uuid,
        trait_id: String,
        input: Value,
        context: CallContext,
    },
    #[serde(rename = "call.cancel")]
    CallCancel { call_id: Uuid },
    /// Exactly one of `result` and `error` is set.
    #[serde(rename = "core.response")]
    CoreResponse {
        request_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<ErrorInfo>,
    },
}

/// Frames the sidecar sends to the core. Types this version does not know, including the
/// reserved `call.input_requested` and `call.component`, parse as `Unknown`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SidecarFrame {
    #[serde(rename = "hello")]
    Hello {
        protocol: u32,
        sidecar_version: String,
        python_version: String,
    },
    #[serde(rename = "traits")]
    Traits { traits: Vec<TraitInfo> },
    #[serde(rename = "pong")]
    Pong { nonce: String },
    #[serde(rename = "call.delta")]
    CallDelta { call_id: Uuid, text: String },
    #[serde(rename = "call.progress")]
    CallProgress {
        call_id: Uuid,
        label: String,
        fraction: Option<f64>,
    },
    #[serde(rename = "call.done")]
    CallDone { call_id: Uuid },
    #[serde(rename = "call.error")]
    CallError { call_id: Uuid, error: ErrorInfo },
    #[serde(rename = "call.cancelled")]
    CallCancelled { call_id: Uuid },
    #[serde(rename = "core.request")]
    CoreRequest {
        request_id: String,
        call_id: Uuid,
        method: String,
        #[serde(default)]
        params: Value,
    },
    #[serde(other)]
    Unknown,
}

/// The frame on one line from the sidecar, or `None` when the line is not a JSON object with
/// a known frame shape.
pub fn parse_line(line: &str) -> Option<SidecarFrame> {
    serde_json::from_str(line.trim_end()).ok()
}

/// The JSON line for `frame`, newline included.
pub fn encode(frame: &CoreFrame) -> String {
    let mut line = serde_json::to_string(frame).expect("frames always serialize");
    line.push('\n');
    line
}

/// `frame` as JSON that is safe to log: a `core.response` result's `value` field, which only
/// the answer to `secret.get` carries, is replaced with `[redacted]`.
pub fn redacted(frame: &CoreFrame) -> String {
    let mut value = serde_json::to_value(frame).expect("frames always serialize");
    if let Some(secret) = value.pointer_mut("/result/value") {
        *secret = Value::String(REDACTED.to_string());
    }
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unknown_types_and_unreadable_lines_are_tolerated() {
        assert_eq!(
            parse_line(r#"{"type":"call.component","call_id":"x"}"#),
            Some(SidecarFrame::Unknown)
        );
        assert_eq!(parse_line(r#"{"type":"something.new"}"#), Some(SidecarFrame::Unknown));
        assert_eq!(parse_line("not json"), None);
        assert_eq!(parse_line(r#"{"no_type":1}"#), None);
        assert_eq!(
            parse_line("{\"type\":\"pong\",\"nonce\":\"7\"}\r\n"),
            Some(SidecarFrame::Pong { nonce: "7".into() })
        );
    }

    #[test]
    fn secret_values_are_redacted_in_logs() {
        let frame = CoreFrame::CoreResponse {
            request_id: "r1".into(),
            result: Some(json!({ "value": "sk-dummy-123" })),
            error: None,
        };
        let logged = redacted(&frame);
        assert!(!logged.contains("sk-dummy-123"));
        assert!(logged.contains(REDACTED));
        assert!(encode(&frame).contains("sk-dummy-123"));
    }

    #[test]
    fn fixture_round_trips_every_frame_type() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../protocol/fixtures/sidecar-frames.json"))
                .unwrap();
        let mut types = Vec::new();
        for original in fixture["core_to_sidecar"].as_array().unwrap() {
            let frame: CoreFrame = serde_json::from_value(original.clone())
                .unwrap_or_else(|e| panic!("cannot parse {original}: {e}"));
            assert_eq!(&serde_json::to_value(&frame).unwrap(), original);
            types.push(original["type"].as_str().unwrap().to_string());
        }
        for original in fixture["sidecar_to_core"].as_array().unwrap() {
            let frame: SidecarFrame = serde_json::from_value(original.clone())
                .unwrap_or_else(|e| panic!("cannot parse {original}: {e}"));
            assert_ne!(frame, SidecarFrame::Unknown, "{original} parsed as unknown");
            assert_eq!(&serde_json::to_value(&frame).unwrap(), original);
            types.push(original["type"].as_str().unwrap().to_string());
        }
        for expected in [
            "hello",
            "traits.list",
            "traits",
            "ping",
            "pong",
            "shutdown",
            "call.start",
            "call.delta",
            "call.progress",
            "call.done",
            "call.error",
            "call.cancel",
            "call.cancelled",
            "core.request",
            "core.response",
        ] {
            assert!(types.iter().any(|t| t == expected), "fixture lacks {expected}");
        }
    }
}
