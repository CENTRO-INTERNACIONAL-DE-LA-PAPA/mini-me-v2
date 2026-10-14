//! Trait calls in flight: starting them, turning their frames into reply events, cancelling
//! them, and answering the requests a Trait makes to the core while it runs.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::assets;
use crate::conversations;
use crate::error::{AppError, AppResult};
use crate::link::{CallContext, CoreFrame, SidecarFrame, TraitInfo};
use crate::protocol::{Author, AuthorKind, ErrorInfo, Message, new_id};
use crate::secrets::SecretSource;
use crate::sidecar::SidecarLog;
use crate::store::Project;

pub const ASSET_CHUNK_BYTES: u64 = 1024 * 1024;

/// How long a cancelled call may take to end before the core stops waiting for it.
pub const CANCEL_TIMEOUT: Duration = Duration::from_secs(5);

const SIDECAR_STOPPED: &str = "sidecar_stopped";

/// The writing end of the link to a running sidecar. Returns `false` when the sidecar can
/// no longer be reached.
pub trait FrameSink: Send + Sync {
    fn send(&self, frame: &CoreFrame) -> bool;
}

struct Call {
    project: Arc<Project>,
    message_id: Uuid,
    trait_id: String,
    cancelling: bool,
}

#[derive(Default)]
struct Inner {
    sink: Option<Arc<dyn FrameSink>>,
    traits: HashMap<String, TraitInfo>,
    calls: HashMap<Uuid, Call>,
}

pub struct TraitCalls {
    inner: Mutex<Inner>,
    secrets: Box<dyn SecretSource>,
    log: Arc<SidecarLog>,
    cancel_timeout: Duration,
}

#[derive(Deserialize)]
struct AssetReadParams {
    asset_id: Uuid,
    offset: u64,
    length: u64,
}

#[derive(Deserialize)]
struct SecretGetParams {
    provider: String,
}

impl TraitCalls {
    pub fn new(secrets: Box<dyn SecretSource>, log: Arc<SidecarLog>, cancel_timeout: Duration) -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            secrets,
            log,
            cancel_timeout,
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Starts using a sidecar that has completed the handshake and listed its Traits.
    pub fn connect(&self, sink: Arc<dyn FrameSink>, traits: Vec<TraitInfo>) {
        let mut inner = self.lock();
        inner.sink = Some(sink);
        inner.traits = traits.into_iter().map(|t| (t.id.clone(), t)).collect();
    }

    /// Forgets the sidecar and fails every reply whose call was still open.
    pub fn disconnect(&self) {
        let calls: Vec<Call> = {
            let mut inner = self.lock();
            inner.sink = None;
            inner.calls.drain().map(|(_, call)| call).collect()
        };
        for call in calls {
            let _ = conversations::fail_reply(
                &call.project,
                call.message_id,
                SIDECAR_STOPPED,
                "Mini-Me's runtime stopped while writing this reply. Send your message again.",
            );
        }
    }

    /// Creates the reply to `message` and starts a call of `trait_id` to produce it.
    pub fn start(
        &self,
        project: Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
        trait_id: &str,
        input: Value,
    ) -> AppResult<Uuid> {
        let Some(sink) = self.lock().sink.clone() else {
            return Err(AppError::new(
                "sidecar_unavailable",
                "Mini-Me's runtime is not ready yet.",
            ));
        };
        let author = Author {
            kind: AuthorKind::System,
            id: trait_id.to_string(),
        };
        let reply = conversations::start_reply(&project, conversation_id, message.id, author)?;
        let call_id = new_id();
        let frame = CoreFrame::CallStart {
            call_id,
            trait_id: trait_id.to_string(),
            input,
            context: CallContext {
                project_id: project.id,
                conversation_id,
                message: message.clone(),
            },
        };
        self.lock().calls.insert(
            call_id,
            Call {
                project: Arc::clone(&project),
                message_id: reply,
                trait_id: trait_id.to_string(),
                cancelling: false,
            },
        );
        if !sink.send(&frame) {
            self.lock().calls.remove(&call_id);
            let _ = conversations::fail_reply(
                &project,
                reply,
                SIDECAR_STOPPED,
                "Mini-Me's runtime could not be reached. Send your message again.",
            );
        }
        Ok(reply)
    }

    /// Asks the sidecar to cancel the call producing `message_id`, and closes the call if
    /// it has not ended within the cancel timeout.
    pub fn cancel_message(self: &Arc<Self>, message_id: Uuid) {
        let (call_id, sink) = {
            let mut inner = self.lock();
            let Some((call_id, call)) = inner
                .calls
                .iter_mut()
                .find(|(_, call)| call.message_id == message_id && !call.cancelling)
            else {
                return;
            };
            call.cancelling = true;
            (*call_id, inner.sink.clone())
        };
        if let Some(sink) = sink {
            sink.send(&CoreFrame::CallCancel { call_id });
        }
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            std::thread::sleep(this.cancel_timeout);
            if this.lock().calls.remove(&call_id).is_some() {
                this.log
                    .line(&format!("call {call_id} did not end after cancel; closed it"));
            }
        });
    }

    fn active(&self, call_id: Uuid) -> Option<(Arc<Project>, Uuid)> {
        let found = self
            .lock()
            .calls
            .get(&call_id)
            .map(|call| (Arc::clone(&call.project), call.message_id));
        if found.is_none() {
            self.log
                .line(&format!("ignoring a frame for call {call_id}, which is not open"));
        }
        found
    }

    fn finish(&self, call_id: Uuid) -> Option<Call> {
        let call = self.lock().calls.remove(&call_id);
        if call.is_none() {
            self.log
                .line(&format!("ignoring the end of call {call_id}, which is not open"));
        }
        call
    }

    /// Applies a call frame from the sidecar. Updates to a reply that has already ended are
    /// rejected by `conversations` and dropped here.
    pub fn handle(self: &Arc<Self>, frame: SidecarFrame) {
        match frame {
            SidecarFrame::CallDelta { call_id, text } => {
                if let Some((project, message_id)) = self.active(call_id) {
                    let _ = conversations::append_delta(&project, message_id, &text);
                }
            }
            SidecarFrame::CallProgress {
                call_id,
                label,
                fraction,
            } => {
                if let Some((project, message_id)) = self.active(call_id) {
                    let _ = conversations::append_progress(&project, message_id, &label, fraction);
                }
            }
            SidecarFrame::CallDone { call_id } => {
                if let Some(call) = self.finish(call_id) {
                    let _ = conversations::complete_reply(&call.project, call.message_id);
                }
            }
            SidecarFrame::CallError { call_id, error } => {
                if let Some(call) = self.finish(call_id) {
                    let _ = conversations::fail_reply(
                        &call.project,
                        call.message_id,
                        &error.code,
                        &error.message,
                    );
                }
            }
            SidecarFrame::CallCancelled { call_id } => {
                if let Some(call) = self.finish(call_id) {
                    let _ = conversations::cancel_reply(&call.project, call.message_id);
                }
            }
            SidecarFrame::CoreRequest {
                request_id,
                call_id,
                method,
                params,
            } => {
                // Asset reads touch the disk; answering on another thread keeps the link's
                // reader free for other calls.
                let this = Arc::clone(self);
                std::thread::spawn(move || {
                    let response = this.respond(request_id, call_id, &method, params);
                    if let Some(sink) = this.lock().sink.clone() {
                        sink.send(&response);
                    }
                });
            }
            _ => {}
        }
    }

    /// The `core.response` to a Trait's request.
    pub fn respond(&self, request_id: String, call_id: Uuid, method: &str, params: Value) -> CoreFrame {
        let outcome = self.answer(call_id, method, params);
        match outcome {
            Ok(result) => CoreFrame::CoreResponse {
                request_id,
                result: Some(result),
                error: None,
            },
            Err(err) => CoreFrame::CoreResponse {
                request_id,
                result: None,
                error: Some(ErrorInfo {
                    code: err.code,
                    message: err.message,
                }),
            },
        }
    }

    fn answer(&self, call_id: Uuid, method: &str, params: Value) -> AppResult<Value> {
        let (project, trait_id) = self
            .lock()
            .calls
            .get(&call_id)
            .map(|call| (Arc::clone(&call.project), call.trait_id.clone()))
            .ok_or_else(|| AppError::new("call_not_active", "This Trait call has ended."))?;
        match method {
            "asset.read" => read_asset(&project, parse_params(params)?),
            "secret.get" => self.secret(&trait_id, parse_params(params)?),
            other => Err(AppError::new(
                "unknown_method",
                format!("The core has no request method called '{other}'."),
            )),
        }
    }

    fn secret(&self, trait_id: &str, params: SecretGetParams) -> AppResult<Value> {
        let declared = self
            .lock()
            .traits
            .get(trait_id)
            .is_some_and(|info| info.providers.iter().any(|p| *p == params.provider));
        if !declared {
            return Err(AppError::new(
                "secret_not_allowed",
                format!("This Trait cannot use the {} secret.", params.provider),
            ));
        }
        let secret = self.secrets.get(&params.provider).ok_or_else(|| {
            AppError::new(
                "secret_unavailable",
                format!("There is no saved secret for {}.", params.provider),
            )
        })?;
        Ok(json!({ "value": secret.expose() }))
    }
}

fn parse_params<T: for<'de> Deserialize<'de>>(params: Value) -> AppResult<T> {
    serde_json::from_value(params).map_err(|e| AppError::invalid_input(e.to_string()))
}

/// Reads up to one chunk of an Asset. `assets::file_path` only finds Assets of this Project
/// and resolves them through the Project-folder confinement check.
fn read_asset(project: &Project, params: AssetReadParams) -> AppResult<Value> {
    let path = assets::file_path(project, params.asset_id)?;
    let mut file = File::open(&path)?;
    let size = file.metadata()?.len();
    let offset = params.offset.min(size);
    file.seek(SeekFrom::Start(offset))?;
    let mut data = Vec::new();
    file.take(params.length.min(ASSET_CHUNK_BYTES))
        .read_to_end(&mut data)?;
    Ok(json!({
        "data": BASE64.encode(&data),
        "size_bytes": size,
        "eof": offset + data.len() as u64 >= size,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations::{SendMessageInput, create, send_message, stop_reply};
    use crate::projects::test_support::temp_project;
    use crate::protocol::{EventKind, MessageStatus};
    use crate::secrets::NoSecrets;
    use crate::secrets::test_support::MemorySecrets;

    #[derive(Default)]
    struct Recorder(Mutex<Vec<CoreFrame>>);

    impl Recorder {
        fn frames(&self) -> Vec<CoreFrame> {
            self.0.lock().unwrap().clone()
        }
    }

    impl FrameSink for Recorder {
        fn send(&self, frame: &CoreFrame) -> bool {
            self.0.lock().unwrap().push(frame.clone());
            true
        }
    }

    fn info(id: &str, providers: &[&str]) -> TraitInfo {
        TraitInfo {
            id: id.to_string(),
            name: "Echo".to_string(),
            description: String::new(),
            input_schema: json!({ "type": "object" }),
            providers: providers.iter().map(|p| p.to_string()).collect(),
        }
    }

    struct Fixture {
        _dir: tempfile::TempDir,
        project: Arc<Project>,
        conversation: Uuid,
        calls: Arc<TraitCalls>,
        sink: Arc<Recorder>,
    }

    fn fixture(secrets: Box<dyn SecretSource>, cancel_timeout: Duration) -> Fixture {
        let (dir, project) = temp_project();
        let project = Arc::new(project);
        let conversation = create(&project).unwrap().id;
        let calls = Arc::new(TraitCalls::new(
            secrets,
            Arc::new(SidecarLog::disabled()),
            cancel_timeout,
        ));
        let sink = Arc::new(Recorder::default());
        calls.connect(
            Arc::clone(&sink) as Arc<dyn FrameSink>,
            vec![info("echo", &[]), info("test-use-secret", &["dummy"])],
        );
        Fixture {
            _dir: dir,
            project,
            conversation,
            calls,
            sink,
        }
    }

    impl Fixture {
        /// Sends a user message and starts `trait_id` for it; returns (call ID, reply ID).
        fn start(&self, trait_id: &str) -> (Uuid, Uuid) {
            let input = SendMessageInput {
                content: "late blight spreads".to_string(),
                attachments: Vec::new(),
                text_components: Vec::new(),
            };
            // A fresh Conversation per call, since a Conversation allows one reply at a time.
            let conversation = create(&self.project).unwrap().id;
            let message = send_message(&self.project, conversation, input, new_id()).unwrap();
            let reply = self
                .calls
                .start(
                    Arc::clone(&self.project),
                    conversation,
                    &message,
                    trait_id,
                    json!({ "text": message.content }),
                )
                .unwrap();
            let call_id = self
                .sink
                .frames()
                .iter()
                .rev()
                .find_map(|f| match f {
                    CoreFrame::CallStart { call_id, .. } => Some(*call_id),
                    _ => None,
                })
                .unwrap();
            (call_id, reply)
        }

        fn conversation_of(&self, reply: Uuid) -> Uuid {
            self.project.lock().load_message(reply).unwrap().unwrap().0
        }

        fn reply_events(&self, reply: Uuid) -> Vec<EventKind> {
            let conversation = self.conversation_of(reply);
            self.project
                .lock()
                .events_after(conversation, 0)
                .unwrap()
                .into_iter()
                .map(|e| e.kind)
                .filter(|kind| match kind {
                    EventKind::MessageCreated { message } => message.id == reply,
                    EventKind::MessageDelta { message_id, .. }
                    | EventKind::MessageProgress { message_id, .. }
                    | EventKind::MessageCompleted { message_id, .. }
                    | EventKind::MessageFailed { message_id, .. }
                    | EventKind::MessageCancelled { message_id } => *message_id == reply,
                    _ => false,
                })
                .collect()
        }

        fn status(&self, reply: Uuid) -> MessageStatus {
            self.project.lock().load_message(reply).unwrap().unwrap().1.status
        }
    }

    fn quick() -> Fixture {
        fixture(Box::new(NoSecrets), CANCEL_TIMEOUT)
    }

    #[test]
    fn frames_map_to_reply_events() {
        let f = quick();
        let (call_id, reply) = f.start("echo");
        f.calls.handle(SidecarFrame::CallDelta { call_id, text: "late ".into() });
        f.calls.handle(SidecarFrame::CallProgress {
            call_id,
            label: "Echoing".into(),
            fraction: Some(0.5),
        });
        f.calls.handle(SidecarFrame::CallDelta { call_id, text: "blight".into() });
        f.calls.handle(SidecarFrame::CallDone { call_id });

        let events = f.reply_events(reply);
        match &events[0] {
            EventKind::MessageCreated { message } => {
                assert_eq!(message.author.id, "echo");
                assert_eq!(message.status, MessageStatus::Streaming);
            }
            other => panic!("expected message.created, got {other:?}"),
        }
        assert!(matches!(&events[2], EventKind::MessageProgress { label, fraction: Some(_), .. } if label == "Echoing"));
        assert!(matches!(&events[4], EventKind::MessageCompleted { content, .. } if content == "late blight"));
        assert_eq!(events.len(), 5);
    }

    #[test]
    fn errors_and_cancellations_end_the_reply() {
        let f = quick();
        let (failing, failed_reply) = f.start("echo");
        f.calls.handle(SidecarFrame::CallError {
            call_id: failing,
            error: ErrorInfo {
                code: "trait_error".into(),
                message: "This Trait always fails.".into(),
            },
        });
        match f.reply_events(failed_reply).last().unwrap() {
            EventKind::MessageFailed { error, .. } => assert_eq!(error.code, "trait_error"),
            other => panic!("expected message.failed, got {other:?}"),
        }

        let (cancelled, cancelled_reply) = f.start("echo");
        f.calls.handle(SidecarFrame::CallCancelled { call_id: cancelled });
        assert_eq!(f.status(cancelled_reply), MessageStatus::Cancelled);
    }

    #[test]
    fn frames_after_the_end_are_ignored() {
        let f = quick();
        let (call_id, reply) = f.start("echo");
        f.calls.handle(SidecarFrame::CallDone { call_id });
        let before = f.reply_events(reply).len();
        f.calls.handle(SidecarFrame::CallDelta { call_id, text: "late".into() });
        f.calls.handle(SidecarFrame::CallError {
            call_id,
            error: ErrorInfo { code: "trait_error".into(), message: String::new() },
        });
        assert_eq!(f.reply_events(reply).len(), before);
        assert_eq!(f.status(reply), MessageStatus::Complete);
    }

    #[test]
    fn stopping_a_reply_cancels_its_call_and_closes_it_after_the_timeout() {
        let f = fixture(Box::new(NoSecrets), Duration::from_millis(50));
        let (call_id, reply) = f.start("echo");
        let stopped = stop_reply(&f.project, f.conversation_of(reply)).unwrap();
        assert_eq!(stopped, vec![reply]);
        for message_id in stopped {
            f.calls.cancel_message(message_id);
        }
        assert!(f.sink.frames().contains(&CoreFrame::CallCancel { call_id }));

        f.calls.handle(SidecarFrame::CallDelta { call_id, text: "more".into() });
        assert!(!f
            .reply_events(reply)
            .iter()
            .any(|e| matches!(e, EventKind::MessageDelta { .. })));

        std::thread::sleep(Duration::from_millis(200));
        let response = f.calls.respond("r1".into(), call_id, "asset.read", json!({}));
        assert!(matches!(response, CoreFrame::CoreResponse { error: Some(e), .. } if e.code == "call_not_active"));
    }

    #[test]
    fn disconnecting_fails_open_replies() {
        let f = quick();
        let (_, first) = f.start("echo");
        let (_, second) = f.start("echo");
        f.calls.disconnect();
        for reply in [first, second] {
            match f.reply_events(reply).last().unwrap() {
                EventKind::MessageFailed { error, .. } => assert_eq!(error.code, SIDECAR_STOPPED),
                other => panic!("expected message.failed, got {other:?}"),
            }
        }
        let message = f.project.lock().load_message(first).unwrap().unwrap().1;
        let err = f
            .calls
            .start(Arc::clone(&f.project), f.conversation, &message, "echo", json!({}))
            .unwrap_err();
        assert_eq!(err.code, "sidecar_unavailable");
    }

    fn error_code(frame: CoreFrame) -> Option<String> {
        match frame {
            CoreFrame::CoreResponse { error, .. } => error.map(|e| e.code),
            _ => None,
        }
    }

    fn result(frame: CoreFrame) -> Value {
        match frame {
            CoreFrame::CoreResponse { result: Some(result), error: None, .. } => result,
            other => panic!("expected a result, got {other:?}"),
        }
    }

    #[test]
    fn assets_are_read_in_chunks_within_the_project() {
        let f = quick();
        let (call_id, _) = f.start("echo");
        let source_dir = tempfile::tempdir().unwrap();
        let source = source_dir.path().join("trial.bin");
        let content: Vec<u8> = (0..(ASSET_CHUNK_BYTES * 5 / 2)).map(|i| (i % 251) as u8).collect();
        std::fs::write(&source, &content).unwrap();
        let asset = assets::import(&f.project, &source).unwrap();

        let mut read = Vec::new();
        let mut responses = 0;
        loop {
            let chunk = result(f.calls.respond(
                "r".into(),
                call_id,
                "asset.read",
                json!({ "asset_id": asset.id, "offset": read.len(), "length": ASSET_CHUNK_BYTES * 4 }),
            ));
            responses += 1;
            read.extend(BASE64.decode(chunk["data"].as_str().unwrap()).unwrap());
            if chunk["eof"].as_bool().unwrap() {
                break;
            }
        }
        assert_eq!(responses, 3);
        assert_eq!(read, content);

        let (_other_dir, other) = temp_project();
        let foreign = assets::import(&other, &source).unwrap();
        let response = f.calls.respond(
            "r".into(),
            call_id,
            "asset.read",
            json!({ "asset_id": foreign.id, "offset": 0, "length": 10 }),
        );
        assert_eq!(error_code(response).as_deref(), Some("not_found"));

        let response = f.calls.respond("r".into(), call_id, "files.delete", json!({}));
        assert_eq!(error_code(response).as_deref(), Some("unknown_method"));
    }

    #[test]
    fn secrets_go_only_to_declared_providers() {
        let f = fixture(Box::new(MemorySecrets::dummy()), CANCEL_TIMEOUT);
        let (echo_call, _) = f.start("echo");
        let response =
            f.calls.respond("r".into(), echo_call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(error_code(response).as_deref(), Some("secret_not_allowed"));

        let (secret_call, reply) = f.start("test-use-secret");
        let response =
            f.calls.respond("r".into(), secret_call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(result(response)["value"], json!("sk-dummy-0123456789"));
        f.calls.handle(SidecarFrame::CallDone { call_id: secret_call });
        let persisted = format!("{:?}", f.reply_events(reply));
        assert!(!persisted.contains("sk-dummy"));

        let g = fixture(Box::new(NoSecrets), CANCEL_TIMEOUT);
        let (call, _) = g.start("test-use-secret");
        let response = g.calls.respond("r".into(), call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(error_code(response).as_deref(), Some("secret_unavailable"));
    }
}
