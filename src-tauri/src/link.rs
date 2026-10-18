//! Frames of the link between the Rust core and the sidecar: one JSON object per line, each
//! with a `type`. `sidecar/src/mini_me_sidecar` speaks the same frames, and
//! `src-tauri/fixtures/sidecar-frames.json` holds one example of each.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::library::Workflow;
use crate::protocol::{ErrorInfo, Message};

/// The link protocol version. Both sides must report the same number.
pub const SIDECAR_PROTOCOL: u32 = 5;

pub const REDACTED: &str = "[redacted]";

/// A sidecar adapter, as discovery reports it. Traits are defined in the core's library and
/// name the adapter that runs them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdapterInfo {
    pub id: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(default)]
    pub providers: Vec<String>,
}

/// A Trait a run's Workflow uses, from the core's Trait library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunTrait {
    pub id: Uuid,
    pub name: String,
    pub instructions: Option<String>,
    /// The sidecar adapter that runs this Trait.
    pub adapter: String,
}

/// The provider and model chosen in Settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallModel {
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunContext {
    pub project_id: Uuid,
    pub conversation_id: Uuid,
    pub message: Message,
    /// Whether the routing decision said the message needs earlier context; `None` without
    /// a decision.
    #[serde(default)]
    pub needs_context: Option<bool>,
}

/// The Mini-Me whose reply a run produces.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunMiniMe {
    pub id: Uuid,
    pub name: String,
}

/// What a run executes. A paused run keeps it, so it resumes with the definitions it
/// started with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunPlan {
    pub mini_me: RunMiniMe,
    pub workflow: Workflow,
    /// Each Trait the Workflow uses, once.
    pub traits: Vec<RunTrait>,
    /// The input of every Trait Step.
    pub input: Value,
    pub context: RunContext,
}

/// Where a resumed run continues: after the approval Step `step_id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunResume {
    /// The opaque state the sidecar sent in `run.paused`.
    pub state: String,
    pub step_id: String,
    pub approved: bool,
}

/// A Mini-Me as the routing request describes it to Jev.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteMiniMe {
    pub id: Uuid,
    pub name: String,
    pub description: String,
}

/// Jev's answer to one Choice question.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChoiceAnswer {
    pub choice: String,
    pub confidence: f64,
    #[serde(default)]
    pub probabilities: BTreeMap<String, f64>,
}

/// Frames the core sends to the sidecar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CoreFrame {
    #[serde(rename = "adapters.list")]
    AdaptersList {},
    #[serde(rename = "ping")]
    Ping { nonce: String },
    #[serde(rename = "shutdown")]
    Shutdown {},
    #[serde(rename = "run.start")]
    RunStart {
        run_id: Uuid,
        #[serde(flatten)]
        plan: RunPlan,
        model: Option<CallModel>,
        resume: Option<RunResume>,
    },
    #[serde(rename = "run.cancel")]
    RunCancel { run_id: Uuid },
    #[serde(rename = "route.start")]
    RouteStart {
        route_id: Uuid,
        state: Value,
        mini_mes: Vec<RouteMiniMe>,
        /// The question IDs to ask: `mini_me`, `reaction`, `needs_context`.
        ask: Vec<String>,
    },
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
/// reserved `call.input_requested`, parse as `Unknown`. Interactive Components arrive as the
/// `component.add` request, so a `call.component` frame is `Unknown` too.
///
/// `call_id` identifies one Trait call, or one model decision of a condition or loop,
/// inside a run; the sidecar announces it in `step.started`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SidecarFrame {
    #[serde(rename = "hello")]
    Hello {
        protocol: u32,
        sidecar_version: String,
        python_version: String,
    },
    #[serde(rename = "adapters")]
    Adapters { adapters: Vec<AdapterInfo> },
    #[serde(rename = "pong")]
    Pong { nonce: String },
    #[serde(rename = "run.delta")]
    RunDelta { run_id: Uuid, text: String },
    #[serde(rename = "run.progress")]
    RunProgress {
        run_id: Uuid,
        label: String,
        fraction: Option<f64>,
    },
    #[serde(rename = "step.started")]
    StepStarted {
        run_id: Uuid,
        step_id: String,
        call_id: Option<Uuid>,
    },
    #[serde(rename = "step.completed")]
    StepCompleted {
        run_id: Uuid,
        step_id: String,
        output: Option<String>,
    },
    /// The run reached the approval Step `step_id` and ended in the sidecar. `output` is the
    /// Workflow's output so far; `state` is opaque to the core.
    #[serde(rename = "run.paused")]
    RunPaused {
        run_id: Uuid,
        step_id: String,
        output: Option<String>,
        state: String,
    },
    #[serde(rename = "run.done")]
    RunDone { run_id: Uuid },
    #[serde(rename = "run.error")]
    RunError { run_id: Uuid, error: ErrorInfo },
    #[serde(rename = "run.cancelled")]
    RunCancelled { run_id: Uuid },
    #[serde(rename = "route.done")]
    RouteDone {
        route_id: Uuid,
        answers: BTreeMap<String, ChoiceAnswer>,
    },
    #[serde(rename = "route.error")]
    RouteError { route_id: Uuid, error: ErrorInfo },
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
            serde_json::from_str(include_str!("../fixtures/sidecar-frames.json"))
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
            "adapters.list",
            "adapters",
            "ping",
            "pong",
            "shutdown",
            "run.start",
            "run.cancel",
            "run.delta",
            "run.progress",
            "step.started",
            "step.completed",
            "run.paused",
            "run.done",
            "run.error",
            "run.cancelled",
            "core.request",
            "core.response",
            "route.start",
            "route.done",
            "route.error",
        ] {
            assert!(types.iter().any(|t| t == expected), "fixture lacks {expected}");
        }
    }
}
