//! Trait calls in flight: starting them, turning their frames into reply events, cancelling
//! them, and answering the requests a Trait makes to the core while it runs.

use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::mpsc::{self, RecvTimeoutError};
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
use crate::link::{
    AdapterInfo, CallContext, CallModel, CallTrait, ChoiceAnswer, CoreFrame, RouteMiniMe,
    SidecarFrame,
};
use crate::protocol::{Author, ErrorInfo, Message, new_id};
use crate::secrets::{SecretSource, provider_name};
use crate::sidecar::SidecarLog;
use crate::store::Project;

pub const ASSET_CHUNK_BYTES: u64 = 1024 * 1024;

/// How long a cancelled call may take to end before the core stops waiting for it.
pub const CANCEL_TIMEOUT: Duration = Duration::from_secs(5);

const SIDECAR_STOPPED: &str = "sidecar_stopped";

/// The only key a routing request may get.
const ROUTING_KEY: &str = "typesafe";

/// Jev's answers to a routing request, by question ID.
pub type RouteAnswers = BTreeMap<String, ChoiceAnswer>;

type RouteOutcome = Result<RouteAnswers, ErrorInfo>;

/// The writing end of the link to a running sidecar. Returns `false` when the sidecar can
/// no longer be reached.
pub trait FrameSink: Send + Sync {
    fn send(&self, frame: &CoreFrame) -> bool;
}

struct Call {
    project: Arc<Project>,
    message_id: Uuid,
    adapter: String,
    /// The provider of the call's model; the only one whose secret the call may get.
    provider: Option<String>,
    cancelling: bool,
}

/// What a reply is produced by: the Trait to run, through which adapter, with which model.
pub struct CallSpec {
    pub author: Author,
    pub adapter: String,
    pub trait_def: CallTrait,
    /// The model chosen in Settings, or `None` when none is set. Sent only to adapters that
    /// declare providers.
    pub model: Option<CallModel>,
    pub input: Value,
    /// The routing decision's answer to whether the message needs earlier context.
    pub needs_context: Option<bool>,
}

#[derive(Default)]
struct Inner {
    sink: Option<Arc<dyn FrameSink>>,
    adapters: HashMap<String, AdapterInfo>,
    calls: HashMap<Uuid, Call>,
    /// Routing requests waiting for their `route.done` or `route.error`.
    routes: HashMap<Uuid, mpsc::Sender<RouteOutcome>>,
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

    /// Starts using a sidecar that has completed the handshake and listed its adapters.
    pub fn connect(&self, sink: Arc<dyn FrameSink>, adapters: Vec<AdapterInfo>) {
        let mut inner = self.lock();
        inner.sink = Some(sink);
        inner.adapters = adapters.into_iter().map(|a| (a.id.clone(), a)).collect();
    }

    /// Forgets the sidecar and fails every reply whose call was still open.
    pub fn disconnect(&self) {
        let calls: Vec<Call> = {
            let mut inner = self.lock();
            inner.sink = None;
            // Dropping the senders wakes every waiting routing request.
            inner.routes.clear();
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

    /// Creates the reply to `message` and starts the call that produces it. An adapter that
    /// needs a model gets none when Settings has none; the reply then fails with
    /// `model_not_set` and no call is started.
    pub fn start(
        &self,
        project: Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
        spec: CallSpec,
    ) -> AppResult<Uuid> {
        let (sink, needs_model) = {
            let inner = self.lock();
            let needs_model = inner
                .adapters
                .get(&spec.adapter)
                .is_some_and(|info| !info.providers.is_empty());
            (inner.sink.clone(), needs_model)
        };
        let Some(sink) = sink else {
            return Err(AppError::new(
                "sidecar_unavailable",
                "Mini-Me's runtime is not ready yet.",
            ));
        };
        let reply = conversations::start_reply(&project, conversation_id, message.id, spec.author)?;
        let model = if needs_model { spec.model } else { None };
        if needs_model && model.is_none() {
            let _ = conversations::fail_reply(
                &project,
                reply,
                "model_not_set",
                "Choose an AI model in Settings first.",
            );
            return Ok(reply);
        }
        let call_id = new_id();
        self.lock().calls.insert(
            call_id,
            Call {
                project: Arc::clone(&project),
                message_id: reply,
                adapter: spec.adapter.clone(),
                provider: model.as_ref().map(|m| m.provider.clone()),
                cancelling: false,
            },
        );
        let frame = CoreFrame::CallStart {
            call_id,
            adapter: spec.adapter,
            trait_def: spec.trait_def,
            model,
            input: spec.input,
            context: CallContext {
                project_id: project.id,
                conversation_id,
                message: message.clone(),
                needs_context: spec.needs_context,
            },
        };
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

    /// Asks the sidecar for Jev's answers to the `ask` questions about `state`, waiting at
    /// most `timeout`. Fails with the sidecar's error, `jev_timeout`, or `sidecar_stopped`.
    pub fn route(
        &self,
        state: Value,
        mini_mes: Vec<RouteMiniMe>,
        ask: Vec<String>,
        timeout: Duration,
    ) -> AppResult<RouteAnswers> {
        let route_id = new_id();
        let (tx, rx) = mpsc::channel();
        let sink = {
            let mut inner = self.lock();
            let Some(sink) = inner.sink.clone() else {
                return Err(AppError::new(SIDECAR_STOPPED, "Mini-Me's runtime is not ready."));
            };
            inner.routes.insert(route_id, tx);
            sink
        };
        let sent = sink.send(&CoreFrame::RouteStart {
            route_id,
            state,
            mini_mes,
            ask,
        });
        let outcome = if sent {
            rx.recv_timeout(timeout)
        } else {
            Err(RecvTimeoutError::Disconnected)
        };
        self.lock().routes.remove(&route_id);
        match outcome {
            Ok(Ok(answers)) => Ok(answers),
            Ok(Err(error)) => Err(AppError::new(&error.code, error.message)),
            Err(RecvTimeoutError::Timeout) => Err(AppError::new(
                "jev_timeout",
                "Typesafe did not answer in time.",
            )),
            Err(RecvTimeoutError::Disconnected) => Err(AppError::new(
                SIDECAR_STOPPED,
                "Mini-Me's runtime stopped before choosing a Mini-Me.",
            )),
        }
    }

    fn finish_route(&self, route_id: Uuid, outcome: RouteOutcome) {
        match self.lock().routes.remove(&route_id) {
            Some(tx) => {
                let _ = tx.send(outcome);
            }
            None => self
                .log
                .line(&format!("ignoring the end of route {route_id}, which is not open")),
        }
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
            SidecarFrame::RouteDone { route_id, answers } => {
                self.finish_route(route_id, Ok(answers));
            }
            SidecarFrame::RouteError { route_id, error } => {
                self.finish_route(route_id, Err(error));
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
        let (call, is_route) = {
            let inner = self.lock();
            let call = inner
                .calls
                .get(&call_id)
                .map(|c| (Arc::clone(&c.project), c.adapter.clone(), c.provider.clone()));
            (call, inner.routes.contains_key(&call_id))
        };
        let Some((project, adapter, provider)) = call else {
            if is_route {
                return self.answer_route(method, params);
            }
            return Err(AppError::new("call_not_active", "This Trait call has ended."));
        };
        match method {
            "asset.read" => read_asset(&project, parse_params(params)?),
            "secret.get" => self.secret(&adapter, provider.as_deref(), parse_params(params)?),
            other => Err(AppError::new(
                "unknown_method",
                format!("The core has no request method called '{other}'."),
            )),
        }
    }

    /// A routing request may only get the Typesafe key.
    fn answer_route(&self, method: &str, params: Value) -> AppResult<Value> {
        if method != "secret.get" {
            return Err(AppError::new(
                "unknown_method",
                format!("A routing request cannot use '{method}'."),
            ));
        }
        let params: SecretGetParams = parse_params(params)?;
        if params.provider != ROUTING_KEY {
            return Err(AppError::new(
                "secret_not_allowed",
                format!("Routing cannot use the {} API key.", provider_name(&params.provider)),
            ));
        }
        self.secret_value(ROUTING_KEY)
    }

    /// A call may get only the secret of its own model's provider, and only if its adapter
    /// declared that provider.
    fn secret(
        &self,
        adapter: &str,
        provider: Option<&str>,
        params: SecretGetParams,
    ) -> AppResult<Value> {
        let declared = self
            .lock()
            .adapters
            .get(adapter)
            .is_some_and(|info| info.providers.iter().any(|p| *p == params.provider));
        if !declared || provider != Some(params.provider.as_str()) {
            return Err(AppError::new(
                "secret_not_allowed",
                format!("This Trait cannot use the {} API key.", provider_name(&params.provider)),
            ));
        }
        self.secret_value(&params.provider)
    }

    fn secret_value(&self, provider: &str) -> AppResult<Value> {
        let secret = self.secrets.get(provider).ok_or_else(|| {
            AppError::new(
                "secret_unavailable",
                format!(
                    "There is no saved {} API key. Add one in Settings.",
                    provider_name(provider)
                ),
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
pub mod test_support {
    use super::*;
    use crate::protocol::AuthorKind;

    /// A call of `adapter`, authored by a Mini-Me called `adapter`, with the dummy provider's
    /// model.
    pub fn spec(adapter: &str, input: Value) -> CallSpec {
        CallSpec {
            author: Author {
                kind: AuthorKind::MiniMe,
                id: adapter.to_string(),
            },
            adapter: adapter.to_string(),
            trait_def: CallTrait {
                id: Uuid::nil(),
                name: "Test".to_string(),
                instructions: None,
            },
            model: Some(CallModel {
                provider: "dummy".to_string(),
                model: "dummy-model".to_string(),
            }),
            input,
            needs_context: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversations::{SendMessageInput, create, send_message, stop_reply};
    use crate::projects::test_support::temp_project;
    use crate::protocol::{EventKind, MessageStatus};
    use crate::secrets::NoSecrets;
    use crate::secrets::test_support::MemorySecrets;
    use super::test_support::spec;

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

    fn info(id: &str, providers: &[&str]) -> AdapterInfo {
        AdapterInfo {
            id: id.to_string(),
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
            vec![
                info("echo", &[]),
                info("test-use-secret", &["dummy"]),
                info("prompt", &["dummy", "openai"]),
            ],
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
        /// Sends a user message and starts `adapter` for it; returns (call ID, reply ID).
        fn start(&self, adapter: &str) -> (Uuid, Uuid) {
            self.start_spec(spec(adapter, json!({ "text": "late blight spreads" })))
        }

        fn start_spec(&self, spec: CallSpec) -> (Uuid, Uuid) {
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
                .start(Arc::clone(&self.project), conversation, &message, spec)
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
            .start(Arc::clone(&f.project), f.conversation, &message, spec("echo", json!({})))
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

    #[test]
    fn secrets_go_only_to_the_calls_own_provider() {
        let f = fixture(Box::new(MemorySecrets::dummy()), CANCEL_TIMEOUT);
        let (call, _) = f.start("prompt");
        let response =
            f.calls.respond("r".into(), call, "secret.get", json!({ "provider": "openai" }));
        assert_eq!(error_code(response).as_deref(), Some("secret_not_allowed"));
        let response =
            f.calls.respond("r".into(), call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(result(response)["value"], json!("sk-dummy-0123456789"));
    }

    #[test]
    fn a_missing_model_fails_the_reply_without_a_call() {
        let f = quick();
        let mut without_model = spec("prompt", json!({ "text": "summarize" }));
        without_model.model = None;
        let sent_before = f.sink.frames().len();
        let input = SendMessageInput {
            content: "summarize".to_string(),
            attachments: Vec::new(),
            text_components: Vec::new(),
        };
        let message = send_message(&f.project, f.conversation, input, new_id()).unwrap();
        let reply = f
            .calls
            .start(Arc::clone(&f.project), f.conversation, &message, without_model)
            .unwrap();
        match f.reply_events(reply).last().unwrap() {
            EventKind::MessageFailed { error, .. } => assert_eq!(error.code, "model_not_set"),
            other => panic!("expected message.failed, got {other:?}"),
        }
        assert_eq!(f.sink.frames().len(), sent_before);
    }

    #[test]
    fn adapters_without_providers_get_no_model() {
        let f = quick();
        f.start("echo");
        let sent = f.sink.frames().into_iter().find_map(|frame| match frame {
            CoreFrame::CallStart { model, .. } => Some(model),
            _ => None,
        });
        assert_eq!(sent, Some(None));
    }

    /// Starts a routing request on another thread; returns its route ID and the outcome.
    fn start_route(
        f: &Fixture,
        timeout: Duration,
    ) -> (Uuid, std::thread::JoinHandle<AppResult<RouteAnswers>>) {
        let calls = Arc::clone(&f.calls);
        let handle = std::thread::spawn(move || {
            calls.route(json!({ "message": "hi" }), Vec::new(), vec!["reaction".into()], timeout)
        });
        let route_id = loop {
            let found = f.sink.frames().into_iter().find_map(|frame| match frame {
                CoreFrame::RouteStart { route_id, .. } => Some(route_id),
                _ => None,
            });
            if let Some(route_id) = found {
                break route_id;
            }
            std::thread::sleep(Duration::from_millis(5));
        };
        (route_id, handle)
    }

    #[test]
    fn a_routing_request_returns_the_sidecars_answers() {
        let f = quick();
        let (route_id, handle) = start_route(&f, CANCEL_TIMEOUT);
        let answer = ChoiceAnswer {
            choice: "👍".into(),
            confidence: 0.9,
            probabilities: BTreeMap::new(),
        };
        let answers = BTreeMap::from([("reaction".to_string(), answer)]);
        f.calls.handle(SidecarFrame::RouteDone { route_id, answers: answers.clone() });
        assert_eq!(handle.join().unwrap().unwrap(), answers);
    }

    #[test]
    fn a_routing_request_times_out_or_ends_with_the_sidecar() {
        let f = quick();
        let (_, handle) = start_route(&f, Duration::from_millis(50));
        assert_eq!(handle.join().unwrap().unwrap_err().code, "jev_timeout");

        let g = quick();
        let (_, handle) = start_route(&g, CANCEL_TIMEOUT);
        g.calls.disconnect();
        assert_eq!(handle.join().unwrap().unwrap_err().code, SIDECAR_STOPPED);
    }

    #[test]
    fn a_routing_request_may_only_get_the_typesafe_key() {
        let secrets = MemorySecrets(HashMap::from([
            ("typesafe".to_string(), "ts-key".to_string()),
            ("openai".to_string(), "sk-openai".to_string()),
        ]));
        let f = fixture(Box::new(secrets), CANCEL_TIMEOUT);
        let (route_id, handle) = start_route(&f, CANCEL_TIMEOUT);
        let ask =
            |method: &str, params: Value| f.calls.respond("r".into(), route_id, method, params);
        let read = json!({ "asset_id": Uuid::nil(), "offset": 0, "length": 1 });
        assert_eq!(error_code(ask("asset.read", read)).as_deref(), Some("unknown_method"));
        assert_eq!(
            error_code(ask("secret.get", json!({ "provider": "openai" }))).as_deref(),
            Some("secret_not_allowed")
        );
        let key = result(ask("secret.get", json!({ "provider": "typesafe" })));
        assert_eq!(key["value"], json!("ts-key"));
        f.calls.handle(SidecarFrame::RouteError {
            route_id,
            error: ErrorInfo { code: "jev_unavailable".into(), message: String::new() },
        });
        assert_eq!(handle.join().unwrap().unwrap_err().code, "jev_unavailable");
    }
}
