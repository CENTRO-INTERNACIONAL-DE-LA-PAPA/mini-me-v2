//! Mini-Me runs in flight: starting and resuming them, turning their frames into reply
//! events, pausing them at approvals, cancelling them, and answering the requests their
//! Trait calls and model decisions make to the core.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::assets;
use crate::comments;
use crate::components;
use crate::conversations::{self, PausedRun};
use crate::error::{AppError, AppResult};
use crate::history::{HISTORY_BUDGET_CHARS, ResultAsset, history, results};
use crate::library::{Library, StepKind, TraitDef, Workflow};
use crate::user_library::LibraryStore;
use crate::link::{
    AdapterInfo, CallModel, ChoiceAnswer, CoreFrame, RouteFile, RouteMiniMe, RunContext,
    RunFile, RunMiniMe, RunPlan, RunResume, RunTrait, SidecarFrame,
};
use crate::protocol::{Author, ErrorInfo, Message, new_id};
use crate::secrets::{SecretSource, is_provider, provider_name};
use crate::sidecar::SidecarLog;
use crate::store::Project;

pub const ASSET_CHUNK_BYTES: u64 = 1024 * 1024;
/// The largest file a Trait may write with `asset.write`.
const MAX_WRITE_BYTES: usize = 32 * 1024 * 1024;
/// The largest resume state the core stores for a paused run.
const MAX_STATE_BYTES: usize = 16 * 1024 * 1024;

/// How long a cancelled run may take to end before the core stops waiting for it.
pub const CANCEL_TIMEOUT: Duration = Duration::from_secs(5);

const SIDECAR_STOPPED: &str = "sidecar_stopped";

/// The only key a routing request may get.
const ROUTING_KEY: &str = "typesafe";

/// Jev's answers to a routing request, by question ID.
pub type RouteAnswers = BTreeMap<String, ChoiceAnswer>;

/// What the sidecar sends about a draft: some text, or its end.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DraftEvent {
    Delta { text: String },
    Done,
    Error { error: ErrorInfo },
}

/// The sender each request waiting for the sidecar's answer is listed under, by its ID.
type Pending<T> = HashMap<Uuid, mpsc::Sender<Result<T, ErrorInfo>>>;

/// What a request to the sidecar fails with when no answer comes.
struct NoAnswer {
    /// The sidecar is not running.
    not_ready: &'static str,
    /// The code and message when the answer takes longer than the request's timeout.
    timeout: (&'static str, &'static str),
    /// The sidecar stopped before it answered.
    stopped: &'static str,
}

/// The writing end of the link to a running sidecar. Returns `false` when the sidecar can
/// no longer be reached.
pub trait FrameSink: Send + Sync {
    fn send(&self, frame: &CoreFrame) -> bool;
}

/// What a reply is produced by. A paused run stores it, so the run resumes with the
/// definitions it started with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunSpec {
    pub author: Author,
    pub mini_me: RunMiniMe,
    pub workflow: Workflow,
    /// Each Trait the Workflow uses.
    pub traits: Vec<TraitDef>,
    /// The input of every Trait Step.
    pub input: Value,
    /// The routing decision's answer to whether the message needs earlier context.
    pub needs_context: Option<bool>,
    /// The file the routing decision picked as the one the message means.
    pub file: Option<RunFile>,
}

impl RunSpec {
    /// The run of `mini_me_id`'s Workflow, with the Traits it uses from `library`, and no
    /// picked file.
    pub fn for_mini_me(
        library: &Library,
        mini_me_id: Uuid,
        author: Author,
        input: Value,
        needs_context: Option<bool>,
    ) -> AppResult<Self> {
        let mini_me = library
            .mini_me(mini_me_id)
            .ok_or_else(|| AppError::not_found("Mini-Me not found"))?;
        Ok(Self {
            author,
            mini_me: RunMiniMe { id: mini_me.id, name: mini_me.name.clone() },
            workflow: mini_me.workflow.clone(),
            traits: library.workflow_traits(&mini_me.workflow).into_iter().cloned().collect(),
            input,
            needs_context,
            file: None,
        })
    }

    fn trait_of(&self, step_id: &str) -> Option<&TraitDef> {
        match self.workflow.step(step_id)?.kind {
            StepKind::Trait { trait_id } => self.traits.iter().find(|t| t.id == trait_id),
            _ => None,
        }
    }

    /// The name a Step is shown with: its Trait's name, else its label, else its type.
    fn step_name(&self, step_id: &str) -> Option<String> {
        let step = self.workflow.step(step_id)?;
        let name = match (self.trait_of(step_id), &step.label) {
            (Some(t), _) => t.name.clone(),
            (None, Some(label)) => label.clone(),
            (None, None) => {
                let type_name = step.type_name();
                type_name[..1].to_uppercase() + &type_name[1..]
            }
        };
        Some(name)
    }
}

/// What a run saves while it is paused, besides the sidecar's state.
#[derive(Serialize, Deserialize)]
struct SavedRun {
    spec: RunSpec,
    /// The user message the reply answers.
    answers: Uuid,
}

/// What a call inside a run may do: a Trait call works through its Trait's adapter; a
/// condition's or loop's model decision may only get the run's AI key.
enum CallKind {
    Trait { adapter: String },
    Decision,
}

/// A reply whose Mini-Me run is in flight.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RunningReply {
    pub project_id: Uuid,
    pub project_name: String,
    pub conversation_id: Uuid,
    pub conversation_title: String,
    pub message_id: Uuid,
    pub mini_me: RunMiniMe,
    /// The name of the Step the run last started; none before its first Step.
    pub step: Option<String>,
}

/// Receives the whole list of running replies; returns `false` when it is gone.
pub type RunningSink = Box<dyn Fn(&[RunningReply]) -> bool + Send>;

struct Run {
    project: Arc<Project>,
    conversation_id: Uuid,
    /// The user message the reply answers.
    answers: Uuid,
    message_id: Uuid,
    spec: RunSpec,
    /// The provider of the run's model; the only AI provider whose secret it may get.
    provider: Option<String>,
    /// Calls that have started and whose Step has not completed, by call ID.
    calls: HashMap<Uuid, (String, CallKind)>,
    cancelling: bool,
    step: Option<String>,
}

#[derive(Default)]
struct Inner {
    sink: Option<Arc<dyn FrameSink>>,
    adapters: HashMap<String, AdapterInfo>,
    runs: HashMap<Uuid, Run>,
    /// Routing requests waiting for their `route.done` or `route.error`.
    routes: Pending<RouteAnswers>,
    /// Summary requests waiting for their `summary.done` or `summary.error`.
    summaries: Pending<String>,
    /// Drafts being written.
    drafts: HashMap<Uuid, mpsc::Sender<DraftEvent>>,
    /// The provider whose key each summary and draft may get, by its ID.
    key_providers: HashMap<Uuid, String>,
    /// Drafts stopped before they were sent to the sidecar; `draft` ends them at once.
    stopped_drafts: HashSet<Uuid>,
    /// PDF exports waiting for their `document.exported` or `document.export_error`.
    exports: Pending<Vec<u8>>,
    /// Previews waiting for their `document.previewed` or `document.preview_error`.
    previews: Pending<Vec<String>>,
}

impl Inner {
    /// The run holding the open call `call_id`.
    fn run_of_call(&self, call_id: Uuid) -> Option<(&Run, &str, &CallKind)> {
        self.runs.values().find_map(|run| {
            run.calls.get(&call_id).map(|(step_id, kind)| (run, step_id.as_str(), kind))
        })
    }
}

pub struct Runs {
    inner: Mutex<Inner>,
    /// Held while a list is built and sent, so subscribers get lists in the order the runs
    /// changed.
    subscribers: Mutex<Vec<RunningSink>>,
    library: Arc<LibraryStore>,
    secrets: Box<dyn SecretSource>,
    log: Arc<SidecarLog>,
    cancel_timeout: Duration,
}

#[derive(Deserialize)]
struct ComponentAddParams {
    kind: String,
    version: u32,
    data: Value,
    text: String,
}

#[derive(Deserialize)]
struct DocumentEditParams {
    asset_id: Uuid,
    edits: Vec<comments::DocumentEdit>,
}

#[derive(Deserialize)]
struct ComponentReadParams {
    component_id: Uuid,
}

#[derive(Deserialize)]
struct AssetWriteParams {
    name: String,
    media_type: String,
    data: String,
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

impl Runs {
    pub fn new(
        secrets: Box<dyn SecretSource>,
        log: Arc<SidecarLog>,
        cancel_timeout: Duration,
        library: Arc<LibraryStore>,
    ) -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            subscribers: Mutex::new(Vec::new()),
            library,
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

    /// Forgets the sidecar and fails every reply whose run was still open. Paused replies
    /// have no open run, so they stay paused.
    pub fn disconnect(&self) {
        let runs: Vec<Run> = {
            let mut inner = self.lock();
            inner.sink = None;
            // Dropping the senders wakes every waiting routing, summary, draft and export
            // request.
            inner.routes.clear();
            inner.summaries.clear();
            inner.drafts.clear();
            inner.exports.clear();
            inner.previews.clear();
            inner.key_providers.clear();
            inner.runs.drain().map(|(_, run)| run).collect()
        };
        self.notify();
        for run in runs {
            let _ = conversations::fail_reply(
                &run.project,
                run.message_id,
                SIDECAR_STOPPED,
                "Mini-Me's runtime stopped while writing this reply. Send your message again.",
            );
        }
    }

    fn sink(&self) -> AppResult<Arc<dyn FrameSink>> {
        self.lock().sink.clone().ok_or_else(|| {
            AppError::new("sidecar_unavailable", "Mini-Me's runtime is not ready yet.")
        })
    }

    /// Whether a run of `spec` needs the model chosen in Settings: when one of its Traits'
    /// adapters calls an AI provider, or a condition or loop asks the model to decide.
    /// Adapters may declare other keys, such as the Ai2 account, without needing a model.
    fn needs_model(&self, spec: &RunSpec) -> bool {
        let inner = self.lock();
        spec.workflow.has_decisions()
            || spec.traits.iter().any(|t| {
                inner
                    .adapters
                    .get(&t.adapter)
                    .is_some_and(|info| info.providers.iter().any(|p| is_provider(p)))
            })
    }

    /// Creates the reply to `message` and starts the run that produces it. When the run
    /// needs a model and Settings has none, the reply fails with `model_not_set` and no run
    /// is started.
    pub fn start(
        &self,
        project: Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
        spec: RunSpec,
        model: Option<CallModel>,
    ) -> AppResult<Uuid> {
        let sink = self.sink()?;
        let reply =
            conversations::start_reply(&project, conversation_id, message.id, spec.author.clone())?;
        self.launch(sink, project, conversation_id, message, reply, spec, model, None);
        Ok(reply)
    }

    /// Resumes the run of a reply whose approval was just approved, from its saved state.
    /// The model is the one chosen in Settings now.
    pub fn resume(
        &self,
        project: Arc<Project>,
        conversation_id: Uuid,
        paused: PausedRun,
        model: Option<CallModel>,
    ) {
        let sink = match self.sink() {
            Ok(sink) => sink,
            Err(_) => {
                let _ = conversations::fail_reply(
                    &project,
                    paused.message_id,
                    SIDECAR_STOPPED,
                    "Mini-Me's runtime could not be reached. Send your message again.",
                );
                return;
            }
        };
        let saved: SavedRun = match serde_json::from_value(paused.run) {
            Ok(saved) => saved,
            Err(_) => {
                let _ = conversations::fail_reply(
                    &project,
                    paused.message_id,
                    "resume_failed",
                    "This reply's saved progress could not be read. Send your message again.",
                );
                return;
            }
        };
        let message = project.lock().load_message_with(saved.answers, false).ok().flatten();
        let Some((_, message)) = message else {
            let _ = conversations::fail_reply(
                &project,
                paused.message_id,
                "resume_failed",
                "The message this reply answers could not be found.",
            );
            return;
        };
        let resume = RunResume { state: paused.state, step_id: paused.step_id, approved: true };
        let reply = paused.message_id;
        self.launch(sink, project, conversation_id, &message, reply, saved.spec, model, Some(resume));
    }

    #[allow(clippy::too_many_arguments)]
    fn launch(
        &self,
        sink: Arc<dyn FrameSink>,
        project: Arc<Project>,
        conversation_id: Uuid,
        message: &Message,
        reply: Uuid,
        spec: RunSpec,
        model: Option<CallModel>,
        resume: Option<RunResume>,
    ) {
        let needs_model = self.needs_model(&spec);
        let model = if needs_model { model } else { None };
        if needs_model && model.is_none() {
            let _ = conversations::fail_reply(
                &project,
                reply,
                "model_not_set",
                "Choose an AI model in Settings first.",
            );
            return;
        }
        let run_id = new_id();
        let plan = RunPlan {
            mini_me: spec.mini_me.clone(),
            workflow: spec.workflow.clone(),
            traits: spec
                .traits
                .iter()
                .map(|t| RunTrait {
                    id: t.id,
                    name: t.name.clone(),
                    instructions: t.instructions.clone(),
                    adapter: t.adapter.clone(),
                    tools: t.tools.clone(),
                })
                .collect(),
            input: spec.input.clone(),
            context: RunContext {
                project_id: project.id,
                conversation_id,
                message: message.clone(),
                needs_context: spec.needs_context,
                file: spec.file.clone(),
                document: comments::run_document(&project, conversation_id).ok().flatten(),
            },
        };
        self.lock().runs.insert(
            run_id,
            Run {
                project: Arc::clone(&project),
                conversation_id,
                answers: message.id,
                message_id: reply,
                spec,
                provider: model.as_ref().map(|m| m.provider.clone()),
                calls: HashMap::new(),
                cancelling: false,
                step: None,
            },
        );
        self.notify();
        if !sink.send(&CoreFrame::RunStart { run_id, plan, model, resume }) {
            self.lock().runs.remove(&run_id);
            self.notify();
            let _ = conversations::fail_reply(
                &project,
                reply,
                SIDECAR_STOPPED,
                "Mini-Me's runtime could not be reached. Send your message again.",
            );
        }
    }

    /// Asks the sidecar for Jev's answers to the `ask` questions about `state`, waiting at
    /// most `timeout`; `mini_mes` and `files` are the options of the `mini_me` and `file`
    /// questions. Fails with the sidecar's error, `jev_timeout`, or `sidecar_stopped`.
    pub fn route(
        &self,
        state: Value,
        mini_mes: Vec<RouteMiniMe>,
        files: Vec<RouteFile>,
        ask: Vec<String>,
        timeout: Duration,
    ) -> AppResult<RouteAnswers> {
        let route_id = new_id();
        let frame = CoreFrame::RouteStart { route_id, state, mini_mes, files, ask };
        let no_answer = NoAnswer {
            not_ready: "Mini-Me's runtime is not ready.",
            timeout: ("jev_timeout", "Typesafe did not answer in time."),
            stopped: "Mini-Me's runtime stopped before choosing a Mini-Me.",
        };
        self.request(|inner| &mut inner.routes, route_id, frame, timeout, no_answer)
    }

    /// Asks the sidecar to summarise `material` with `model`, waiting at most `timeout`.
    /// Fails with the sidecar's error, `summary_timeout`, or `sidecar_stopped`.
    pub fn summarize(
        &self,
        model: CallModel,
        material: String,
        timeout: Duration,
    ) -> AppResult<String> {
        let summary_id = new_id();
        self.lock().key_providers.insert(summary_id, model.provider.clone());
        let frame = CoreFrame::SummaryStart { summary_id, model, material };
        let no_answer = NoAnswer {
            not_ready: "Mini-Me's runtime is not ready.",
            timeout: ("summary_timeout", "The AI model did not finish the summary in time. Try again."),
            stopped: "Mini-Me's runtime stopped before the summary was written.",
        };
        let summary = self.request(|inner| &mut inner.summaries, summary_id, frame, timeout, no_answer);
        self.lock().key_providers.remove(&summary_id);
        summary
    }

    /// Drafts a report titled `title` from `material` with `model`, passing each piece of text
    /// to `on_event` as it arrives, until the draft ends, is cancelled with `cancel_draft`, or
    /// no text arrives for `idle`. Returns the whole text, and the error that ended it if one
    /// did; the text written before an error is kept.
    pub fn draft(
        &self,
        draft_id: Uuid,
        model: CallModel,
        title: String,
        material: String,
        idle: Duration,
        mut on_event: impl FnMut(&DraftEvent),
    ) -> (String, Option<AppError>) {
        let (tx, rx) = mpsc::channel();
        let sink = {
            let mut inner = self.lock();
            if inner.stopped_drafts.remove(&draft_id) {
                return (String::new(), None);
            }
            let Some(sink) = inner.sink.clone() else {
                let error = AppError::new(SIDECAR_STOPPED, "Mini-Me's runtime is not ready.");
                return (String::new(), Some(error));
            };
            inner.drafts.insert(draft_id, tx);
            inner.key_providers.insert(draft_id, model.provider.clone());
            sink
        };
        let mut text = String::new();
        let mut ending = None;
        if sink.send(&CoreFrame::DraftStart { draft_id, model, title, material }) {
            loop {
                match rx.recv_timeout(idle) {
                    Ok(event) => {
                        on_event(&event);
                        match event {
                            DraftEvent::Delta { text: piece } => text.push_str(&piece),
                            DraftEvent::Done => break,
                            DraftEvent::Error { error } => {
                                ending = Some(AppError::new(&error.code, error.message));
                                break;
                            }
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        sink.send(&CoreFrame::DraftCancel { draft_id });
                        ending = Some(AppError::new(
                            "draft_timeout",
                            "The AI model stopped sending the draft. Try again.",
                        ));
                        break;
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        ending = Some(AppError::new(
                            SIDECAR_STOPPED,
                            "Mini-Me's runtime stopped while writing the draft.",
                        ));
                        break;
                    }
                }
            }
        } else {
            ending = Some(AppError::new(SIDECAR_STOPPED, "Mini-Me's runtime could not be reached."));
        }
        let mut inner = self.lock();
        inner.drafts.remove(&draft_id);
        inner.key_providers.remove(&draft_id);
        drop(inner);
        (text, ending)
    }

    /// Asks the sidecar to stop the draft `draft_id`; it then ends as `Done`. A draft not yet
    /// sent to the sidecar, because the core is still gathering its material, ends empty when
    /// it would start.
    pub fn cancel_draft(&self, draft_id: Uuid) {
        let sink = {
            let mut inner = self.lock();
            if !inner.drafts.contains_key(&draft_id) {
                inner.stopped_drafts.insert(draft_id);
                return;
            }
            inner.sink.clone()
        };
        if let Some(sink) = sink {
            sink.send(&CoreFrame::DraftCancel { draft_id });
        }
    }

    fn draft_event(&self, draft_id: Uuid, event: DraftEvent) {
        let tx = self.lock().drafts.get(&draft_id).cloned();
        match tx {
            Some(tx) => {
                let _ = tx.send(event);
            }
            None => self
                .log
                .line(&format!("ignoring a frame for draft {draft_id}, which is not open")),
        }
    }

    /// The document `source`, named `name`, as PDF, within `timeout`.
    pub fn export_pdf(&self, name: String, source: String, timeout: Duration) -> AppResult<Vec<u8>> {
        let export_id = new_id();
        let frame = CoreFrame::DocumentExport { export_id, name, source };
        let no_answer = NoAnswer {
            not_ready: "Mini-Me is not ready yet. Try again when it is.",
            timeout: ("export_timeout", "The PDF took too long to make. Try again."),
            stopped: "Mini-Me's runtime stopped before the PDF was made.",
        };
        self.request(|inner| &mut inner.exports, export_id, frame, timeout, no_answer)
    }

    /// The document `source` as SVG images, one per page, within `timeout`.
    pub fn preview(&self, source: String, timeout: Duration) -> AppResult<Vec<String>> {
        let preview_id = new_id();
        let frame = CoreFrame::DocumentPreview { preview_id, source };
        let no_answer = NoAnswer {
            not_ready: "Mini-Me is not ready yet. Try again when it is.",
            timeout: ("preview_timeout", "The preview took too long to make. Try again."),
            stopped: "Mini-Me's runtime stopped before the preview was made.",
        };
        self.request(|inner| &mut inner.previews, preview_id, frame, timeout, no_answer)
    }

    /// Sends `frame` for the request `id`, listed in `pending` until it ends, and waits at most
    /// `timeout` for the sidecar's answer, which `answered` passes on.
    fn request<T>(
        &self,
        pending: fn(&mut Inner) -> &mut Pending<T>,
        id: Uuid,
        frame: CoreFrame,
        timeout: Duration,
        no_answer: NoAnswer,
    ) -> AppResult<T> {
        let (tx, rx) = mpsc::channel();
        let sink = {
            let mut inner = self.lock();
            let Some(sink) = inner.sink.clone() else {
                return Err(AppError::new(SIDECAR_STOPPED, no_answer.not_ready));
            };
            pending(&mut inner).insert(id, tx);
            sink
        };
        let outcome = if sink.send(&frame) {
            rx.recv_timeout(timeout)
        } else {
            Err(RecvTimeoutError::Disconnected)
        };
        pending(&mut self.lock()).remove(&id);
        match outcome {
            Ok(Ok(answer)) => Ok(answer),
            Ok(Err(error)) => Err(AppError::new(&error.code, error.message)),
            Err(RecvTimeoutError::Timeout) => {
                Err(AppError::new(no_answer.timeout.0, no_answer.timeout.1))
            }
            Err(RecvTimeoutError::Disconnected) => {
                Err(AppError::new(SIDECAR_STOPPED, no_answer.stopped))
            }
        }
    }

    /// Passes the sidecar's answer to the request `id` of `pending`, named `what` in the log.
    fn answered<T>(
        &self,
        pending: fn(&mut Inner) -> &mut Pending<T>,
        what: &str,
        id: Uuid,
        outcome: Result<T, ErrorInfo>,
    ) {
        match pending(&mut self.lock()).remove(&id) {
            Some(tx) => {
                let _ = tx.send(outcome);
            }
            None => self.log.line(&format!("ignoring the end of {what} {id}, which is not open")),
        }
    }

    /// Asks the sidecar to cancel the run producing `message_id`, and closes the run if it
    /// has not ended within the cancel timeout.
    pub fn cancel_message(self: &Arc<Self>, message_id: Uuid) {
        let (run_id, sink) = {
            let mut inner = self.lock();
            let Some((run_id, run)) = inner
                .runs
                .iter_mut()
                .find(|(_, run)| run.message_id == message_id && !run.cancelling)
            else {
                return;
            };
            run.cancelling = true;
            (*run_id, inner.sink.clone())
        };
        if let Some(sink) = sink {
            sink.send(&CoreFrame::RunCancel { run_id });
        }
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            std::thread::sleep(this.cancel_timeout);
            if this.lock().runs.remove(&run_id).is_some() {
                this.notify();
                this.log
                    .line(&format!("run {run_id} did not end after cancel; closed it"));
            }
        });
    }

    /// Sends the running replies to `sink` and then every change to them.
    pub fn subscribe(&self, sink: RunningSink) {
        let mut subscribers = self.subscribers.lock().unwrap_or_else(|p| p.into_inner());
        if sink(&self.running()) {
            subscribers.push(sink);
        }
    }

    /// Every reply whose run is in flight, oldest run first.
    pub fn running(&self) -> Vec<RunningReply> {
        let mut runs: Vec<_> = {
            let inner = self.lock();
            inner
                .runs
                .iter()
                .map(|(run_id, run)| {
                    (
                        *run_id,
                        Arc::clone(&run.project),
                        run.conversation_id,
                        run.message_id,
                        run.spec.mini_me.clone(),
                        run.step.clone(),
                    )
                })
                .collect()
        };
        // Run IDs are UUIDv7, so they sort by start time.
        runs.sort_by_key(|run| run.0);
        // Titles are read after the runs lock is released, so no Project lock is taken
        // while it is held.
        runs.into_iter()
            .filter(|(_, project, conversation_id, ..)| {
                !comments::is_thread(&project.lock(), *conversation_id).unwrap_or(false)
            })
            .map(|(_, project, conversation_id, message_id, mini_me, step)| RunningReply {
                project_id: project.id,
                project_name: project.name.clone(),
                conversation_id,
                conversation_title: conversations::title(&project, conversation_id)
                    .unwrap_or_default(),
                message_id,
                mini_me,
                step,
            })
            .collect()
    }

    fn notify(&self) {
        let mut subscribers = self.subscribers.lock().unwrap_or_else(|p| p.into_inner());
        if subscribers.is_empty() {
            return;
        }
        let running = self.running();
        subscribers.retain(|sink| sink(&running));
    }

    fn active(&self, run_id: Uuid) -> Option<(Arc<Project>, Uuid)> {
        let found = self
            .lock()
            .runs
            .get(&run_id)
            .map(|run| (Arc::clone(&run.project), run.message_id));
        if found.is_none() {
            self.log
                .line(&format!("ignoring a frame for run {run_id}, which is not open"));
        }
        found
    }

    fn finish(&self, run_id: Uuid) -> Option<Run> {
        let run = self.lock().runs.remove(&run_id);
        match run {
            Some(_) => self.notify(),
            None => self
                .log
                .line(&format!("ignoring the end of run {run_id}, which is not open")),
        }
        run
    }

    fn step_started(&self, run_id: Uuid, step_id: String, call_id: Option<Uuid>) {
        let started = {
            let mut inner = self.lock();
            let Some(run) = inner.runs.get_mut(&run_id) else {
                drop(inner);
                self.log.line(&format!("ignoring a frame for run {run_id}, which is not open"));
                return;
            };
            let (Some(step), Some(name)) =
                (run.spec.workflow.step(&step_id).cloned(), run.spec.step_name(&step_id))
            else {
                drop(inner);
                self.log.line(&format!("ignoring the unknown Step {step_id:?} of run {run_id}"));
                return;
            };
            if let Some(call_id) = call_id {
                let kind = match run.spec.trait_of(&step_id) {
                    Some(t) => CallKind::Trait { adapter: t.adapter.clone() },
                    None => CallKind::Decision,
                };
                run.calls.insert(call_id, (step_id.clone(), kind));
            }
            run.step = Some(name.clone());
            (Arc::clone(&run.project), run.message_id, step.type_name(), name)
        };
        self.notify();
        let (project, message_id, step_type, name) = started;
        let _ = conversations::append_step_started(&project, message_id, &step_id, step_type, &name);
    }

    fn step_completed(&self, run_id: Uuid, step_id: String, output: Option<String>) {
        let completed = {
            let mut inner = self.lock();
            inner.runs.get_mut(&run_id).map(|run| {
                run.calls.retain(|_, (id, _)| *id != step_id);
                (Arc::clone(&run.project), run.message_id)
            })
        };
        match completed {
            Some((project, message_id)) => {
                let _ = conversations::append_step_completed(&project, message_id, &step_id, output);
            }
            None => self.log.line(&format!("ignoring a frame for run {run_id}, which is not open")),
        }
    }

    /// Saves a run that reached an approval, so the reply waits for the user's answer.
    fn paused(&self, run_id: Uuid, step_id: String, output: Option<String>, state: String) {
        let Some(run) = self.finish(run_id) else {
            return;
        };
        if state.len() > MAX_STATE_BYTES {
            let _ = conversations::fail_reply(
                &run.project,
                run.message_id,
                "state_too_large",
                "This reply's progress is too large to save while it waits for your approval.",
            );
            return;
        }
        let prompt = match run.spec.workflow.step(&step_id).map(|s| &s.kind) {
            Some(StepKind::Approval { prompt }) => prompt.clone(),
            _ => {
                let _ = conversations::fail_reply(
                    &run.project,
                    run.message_id,
                    "trait_error",
                    "The Workflow paused at a Step that is not an approval.",
                );
                return;
            }
        };
        let saved = SavedRun { spec: run.spec, answers: run.answers };
        let paused = PausedRun {
            message_id: run.message_id,
            step_id,
            component_id: new_id(),
            run: serde_json::to_value(saved).expect("a run spec always serializes"),
            output,
            state,
        };
        let _ = conversations::pause_reply(&run.project, paused, &prompt);
    }

    /// Applies a run frame from the sidecar. Updates to a reply that has already ended are
    /// rejected by `conversations` and dropped here.
    pub fn handle(self: &Arc<Self>, frame: SidecarFrame) {
        match frame {
            SidecarFrame::RunDelta { run_id, text } => {
                if let Some((project, message_id)) = self.active(run_id) {
                    let _ = conversations::append_delta(&project, message_id, &text);
                }
            }
            SidecarFrame::RunProgress {
                run_id,
                label,
                fraction,
            } => {
                if let Some((project, message_id)) = self.active(run_id) {
                    let _ = conversations::append_progress(&project, message_id, &label, fraction);
                }
            }
            SidecarFrame::StepStarted { run_id, step_id, call_id } => {
                self.step_started(run_id, step_id, call_id);
            }
            SidecarFrame::StepCompleted { run_id, step_id, output } => {
                self.step_completed(run_id, step_id, output);
            }
            SidecarFrame::RunPaused { run_id, step_id, output, state } => {
                self.paused(run_id, step_id, output, state);
            }
            SidecarFrame::RunDone { run_id } => {
                if let Some(run) = self.finish(run_id) {
                    let _ = conversations::complete_reply(&run.project, run.message_id);
                }
            }
            SidecarFrame::RunError { run_id, error } => {
                if let Some(run) = self.finish(run_id) {
                    let _ = conversations::fail_reply(
                        &run.project,
                        run.message_id,
                        &error.code,
                        &error.message,
                    );
                }
            }
            SidecarFrame::RunCancelled { run_id } => {
                if let Some(run) = self.finish(run_id) {
                    let _ = conversations::cancel_reply(&run.project, run.message_id);
                }
            }
            SidecarFrame::RouteDone { route_id, answers } => {
                self.answered(|inner| &mut inner.routes, "route", route_id, Ok(answers));
            }
            SidecarFrame::RouteError { route_id, error } => {
                self.answered(|inner| &mut inner.routes, "route", route_id, Err(error));
            }
            SidecarFrame::SummaryDone { summary_id, text } => {
                self.answered(|inner| &mut inner.summaries, "summary", summary_id, Ok(text));
            }
            SidecarFrame::SummaryError { summary_id, error } => {
                self.answered(|inner| &mut inner.summaries, "summary", summary_id, Err(error));
            }
            SidecarFrame::DraftDelta { draft_id, text } => {
                self.draft_event(draft_id, DraftEvent::Delta { text });
            }
            SidecarFrame::DraftDone { draft_id } => self.draft_event(draft_id, DraftEvent::Done),
            SidecarFrame::DraftError { draft_id, error } => {
                self.draft_event(draft_id, DraftEvent::Error { error });
            }
            SidecarFrame::DocumentExported { export_id, data } => {
                let outcome = BASE64.decode(data.as_bytes()).map_err(|_| ErrorInfo {
                    code: "export_failed".into(),
                    message: "The PDF arrived damaged. Try again.".into(),
                });
                self.answered(|inner| &mut inner.exports, "export", export_id, outcome);
            }
            SidecarFrame::DocumentExportError { export_id, error } => {
                self.answered(|inner| &mut inner.exports, "export", export_id, Err(error));
            }
            SidecarFrame::DocumentPreviewed { preview_id, pages } => {
                self.answered(|inner| &mut inner.previews, "preview", preview_id, Ok(pages));
            }
            SidecarFrame::DocumentPreviewError { preview_id, error } => {
                self.answered(|inner| &mut inner.previews, "preview", preview_id, Err(error));
            }
            SidecarFrame::CoreRequest {
                request_id,
                call_id,
                method,
                params,
            } => {
                // Asset reads touch the disk; answering on another thread keeps the link's
                // reader free for other runs.
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

    /// The `core.response` to a request from a call or a routing request.
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
        /// What answering a call's request needs, read under the lock.
        struct Place {
            project: Arc<Project>,
            conversation_id: Uuid,
            answers: Uuid,
            reply: Uuid,
            /// The reply's author, the Mini-Me that adds what the call saves.
            author: Author,
            provider: Option<String>,
            /// The Step the call runs.
            step_id: String,
            /// The adapter of a Trait call; `None` for a decision.
            call: Option<String>,
        }
        let (place, is_route, summary_provider) = {
            let inner = self.lock();
            let place = inner.run_of_call(call_id).map(|(run, step_id, kind)| Place {
                project: Arc::clone(&run.project),
                conversation_id: run.conversation_id,
                answers: run.answers,
                reply: run.message_id,
                author: run.spec.author.clone(),
                provider: run.provider.clone(),
                step_id: step_id.to_string(),
                call: match kind {
                    CallKind::Trait { adapter } => Some(adapter.clone()),
                    CallKind::Decision => None,
                },
            });
            // A summary or a draft may only get its own model's key.
            let summary_provider = inner.key_providers.get(&call_id).cloned();
            (place, inner.routes.contains_key(&call_id), summary_provider)
        };
        let Some(place) = place else {
            if is_route {
                return self.answer_key("routing request", Some(ROUTING_KEY), method, params);
            }
            if let Some(provider) = summary_provider {
                return self.answer_key("summary request", Some(&provider), method, params);
            }
            return Err(AppError::new("call_not_active", "This Trait call has ended."));
        };
        let Some(adapter) = place.call else {
            return self.answer_key("Workflow decision", place.provider.as_deref(), method, params);
        };
        let project = place.project;
        let reply = place.reply;
        match method {
            "asset.read" => read_asset(&project, parse_params(params)?),
            "conversation.history" => {
                let messages = project.lock().conversation_messages(place.conversation_id)?;
                let library = self.library.current();
                let history = history(&messages, place.answers, &library, HISTORY_BUDGET_CHARS);
                Ok(serde_json::to_value(history)?)
            }
            "secret.get" => self.secret(&adapter, place.provider.as_deref(), parse_params(params)?),
            "asset.write" => {
                let p: AssetWriteParams = parse_params(params)?;
                let bytes = decode_asset(&p.data)?;
                let file = (p.name.as_str(), p.media_type.as_str(), bytes.as_slice());
                let asset = conversations::attach_generated(&project, reply, &place.author, file)
                    .map_err(reply_ended)?;
                Ok(json!({ "asset": asset }))
            }
            "conversation.results" => {
                let state = project.lock();
                let messages = state.conversation_messages(place.conversation_id)?;
                let library = self.library.current();
                let mut found = results(&messages, place.answers, reply, &library, |id| {
                    assets::find(&state, id).ok()
                });
                // A thread's document is part of what its comment is about.
                if let Some(document) = comments::document_of(&state, place.conversation_id)? {
                    found.assets.retain(|a| a.asset.id != document.id);
                    let message_id = place.answers;
                    let listed = ResultAsset { asset: document, message_id, current: true };
                    found.assets.insert(0, listed);
                }
                Ok(serde_json::to_value(found)?)
            }
            "component.read" => {
                let p: ComponentReadParams = parse_params(params)?;
                components::read(&project.lock(), place.conversation_id, p.component_id)
            }
            "component.add" => {
                let p: ComponentAddParams = parse_params(params)?;
                let data = match p.kind.as_str() {
                    "suggestion" => comments::suggestion(&project, place.conversation_id, &p.data)?,
                    _ => p.data,
                };
                let component = (p.kind.as_str(), p.version, data, p.text);
                let step_id = Some(place.step_id.as_str());
                let id = conversations::add_component(&project, reply, step_id, component)
                    .map_err(reply_ended)?;
                Ok(json!({ "component_id": id }))
            }
            "document.edit" => {
                let p: DocumentEditParams = parse_params(params)?;
                let call = comments::EditingCall {
                    conversation_id: place.conversation_id,
                    answers: place.answers,
                    reply,
                    author: &place.author,
                    step_id: Some(place.step_id.as_str()),
                };
                let edited = comments::edit_document(&project, &call, p.asset_id, &p.edits)
                    .map_err(reply_ended)?;
                Ok(serde_json::to_value(edited)?)
            }
            other => Err(AppError::new(
                "unknown_method",
                format!("The core has no request method called '{other}'."),
            )),
        }
    }

    /// A request that may only get the `allowed` API key, such as a routing request, which
    /// may only get Typesafe's. `what` names the request in errors.
    fn answer_key(
        &self,
        what: &str,
        allowed: Option<&str>,
        method: &str,
        params: Value,
    ) -> AppResult<Value> {
        if method != "secret.get" {
            return Err(AppError::new(
                "unknown_method",
                format!("A {what} cannot use '{method}'."),
            ));
        }
        let params: SecretGetParams = parse_params(params)?;
        if allowed != Some(params.provider.as_str()) {
            return Err(AppError::new(
                "secret_not_allowed",
                format!("This {what} cannot use the {} API key.", provider_name(&params.provider)),
            ));
        }
        self.secret_value(&params.provider)
    }

    /// A Trait call may get only secrets its adapter declared: for an AI provider, only the
    /// one of its run's model; other keys, such as the Ai2 account, whenever declared.
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
        let allowed = !is_provider(&params.provider) || provider == Some(params.provider.as_str());
        if !declared || !allowed {
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

/// The bytes of a written Asset, refused with `invalid_input` past `MAX_WRITE_BYTES`.
fn decode_asset(data: &str) -> AppResult<Vec<u8>> {
    let too_large = || AppError::invalid_input("A file a Trait writes may be at most 32 MiB.");
    if data.len() / 4 * 3 > MAX_WRITE_BYTES + 3 {
        return Err(too_large());
    }
    let bytes = BASE64
        .decode(data)
        .map_err(|_| AppError::invalid_input("The file's data is not valid base64."))?;
    if bytes.len() > MAX_WRITE_BYTES {
        return Err(too_large());
    }
    Ok(bytes)
}

/// A reply that was stopped while its call winds down takes no more output, as if the call
/// had ended.
fn reply_ended(err: AppError) -> AppError {
    if err.code == "reply_finished" {
        AppError::new("call_not_active", "This Trait call has ended.")
    } else {
        err
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
    use crate::library::Step;
    use crate::protocol::AuthorKind;

    /// The ID of the one Step of a `spec` run.
    pub const STEP: &str = "test";

    /// A one-Step run of `adapter`, authored by a Mini-Me called `adapter`.
    pub fn spec(adapter: &str, input: Value) -> RunSpec {
        let trait_def = TraitDef {
            id: Uuid::nil(),
            name: "Test".to_string(),
            description: String::new(),
            color: String::new(),
            adapter: adapter.to_string(),
            instructions: None,
            tools: Vec::new(),
        };
        let step = Step {
            id: STEP.to_string(),
            label: None,
            kind: StepKind::Trait { trait_id: trait_def.id },
        };
        RunSpec {
            author: Author { kind: AuthorKind::MiniMe, id: adapter.to_string() },
            mini_me: RunMiniMe { id: Uuid::nil(), name: adapter.to_string() },
            workflow: Workflow { steps: vec![step] },
            traits: vec![trait_def],
            input,
            needs_context: None,
            file: None,
        }
    }

    /// The dummy provider's model.
    pub fn dummy_model() -> Option<CallModel> {
        Some(CallModel {
            provider: "dummy".to_string(),
            model: "dummy-model".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::comments::test_support::into_thread;
    use crate::conversations::{SendMessageInput, create, send_message, stop_reply};
    use crate::library::Step;
    use crate::projects::test_support::{temp_project, user};
    use crate::protocol::{EventKind, MessageStatus};
    use crate::secrets::NoSecrets;
    use crate::secrets::test_support::MemorySecrets;
    use super::test_support::{STEP, dummy_model, spec};

    #[derive(Default)]
    struct Recorder(Mutex<Vec<CoreFrame>>);

    impl Recorder {
        fn frames(&self) -> Vec<CoreFrame> {
            self.0.lock().unwrap().clone()
        }

        /// The ID of the latest `run.start`.
        fn last_run(&self) -> Uuid {
            self.frames()
                .iter()
                .rev()
                .find_map(|f| match f {
                    CoreFrame::RunStart { run_id, .. } => Some(*run_id),
                    _ => None,
                })
                .unwrap()
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
        runs: Arc<Runs>,
        sink: Arc<Recorder>,
    }

    fn fixture(secrets: Box<dyn SecretSource>, cancel_timeout: Duration) -> Fixture {
        let (dir, project) = temp_project();
        let project = Arc::new(project);
        let conversation = create(&project).unwrap().id;
        let runs = Arc::new(Runs::new(
            secrets,
            Arc::new(SidecarLog::disabled()),
            cancel_timeout,
            LibraryStore::builtin(),
        ));
        let sink = Arc::new(Recorder::default());
        runs.connect(
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
            runs,
            sink,
        }
    }

    impl Fixture {
        /// Sends a user message and starts a run of `adapter` for it; returns (run ID,
        /// reply ID).
        fn start(&self, adapter: &str) -> (Uuid, Uuid) {
            self.start_spec(spec(adapter, json!({ "text": "late blight spreads" })), dummy_model())
        }

        fn start_spec(&self, spec: RunSpec, model: Option<CallModel>) -> (Uuid, Uuid) {
            // A fresh Conversation per run, since a Conversation allows one reply at a time.
            let conversation = create(&self.project).unwrap().id;
            let message = self.send(conversation, "late blight spreads");
            let reply = self
                .runs
                .start(Arc::clone(&self.project), conversation, &message, spec, model)
                .unwrap();
            (self.sink.last_run(), reply)
        }

        fn send(&self, conversation: Uuid, content: &str) -> Message {
            let input = SendMessageInput {
                content: content.to_string(),
                attachments: Vec::new(),
                text_components: Vec::new(),
            };
            send_message(&self.project, conversation, input, new_id()).unwrap()
        }

        /// Starts a run of `adapter` and its one Step's Trait call; returns (call ID, reply
        /// ID).
        fn start_call(&self, adapter: &str) -> (Uuid, Uuid) {
            let (run_id, reply) = self.start(adapter);
            (self.step(run_id, STEP), reply)
        }

        /// Starts `step_id` of `run_id` with a new call; returns the call ID.
        fn step(&self, run_id: Uuid, step_id: &str) -> Uuid {
            let call_id = new_id();
            self.runs.handle(SidecarFrame::StepStarted {
                run_id,
                step_id: step_id.into(),
                call_id: Some(call_id),
            });
            call_id
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
                    | EventKind::MessagePaused { message_id }
                    | EventKind::StepStarted { message_id, .. }
                    | EventKind::StepCompleted { message_id, .. }
                    | EventKind::MessageCancelled { message_id } => *message_id == reply,
                    _ => false,
                })
                .collect()
        }

        fn message(&self, reply: Uuid) -> Message {
            self.project.lock().load_message(reply).unwrap().unwrap().1
        }

        fn status(&self, reply: Uuid) -> MessageStatus {
            self.message(reply).status
        }
    }

    fn quick() -> Fixture {
        fixture(Box::new(NoSecrets), CANCEL_TIMEOUT)
    }

    #[test]
    fn frames_map_to_reply_events() {
        let f = quick();
        let (run_id, reply) = f.start("echo");
        f.runs.handle(SidecarFrame::RunDelta { run_id, text: "late ".into() });
        f.runs.handle(SidecarFrame::RunProgress {
            run_id,
            label: "Echoing".into(),
            fraction: Some(0.5),
        });
        f.runs.handle(SidecarFrame::RunDelta { run_id, text: "blight".into() });
        f.runs.handle(SidecarFrame::RunDone { run_id });

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
    fn step_frames_become_step_events() {
        let f = quick();
        let (run_id, reply) = f.start("echo");
        f.step(run_id, STEP);
        f.runs.handle(SidecarFrame::StepCompleted {
            run_id,
            step_id: STEP.into(),
            output: Some("late blight".into()),
        });
        f.runs.handle(SidecarFrame::StepStarted {
            run_id,
            step_id: "not-in-the-workflow".into(),
            call_id: None,
        });
        let steps = f.message(reply).steps;
        assert_eq!(steps.len(), 1);
        assert_eq!((steps[0].name.as_str(), steps[0].step_type.as_str()), ("Test", "trait"));
        assert_eq!((steps[0].output.as_deref(), steps[0].done), (Some("late blight"), true));
    }

    /// Subscribes to the running replies; returns every list sent so far.
    fn watch(f: &Fixture) -> Arc<Mutex<Vec<Vec<RunningReply>>>> {
        let lists = Arc::new(Mutex::new(Vec::new()));
        let sent = Arc::clone(&lists);
        f.runs.subscribe(Box::new(move |running| {
            sent.lock().unwrap().push(running.to_vec());
            true
        }));
        lists
    }

    #[test]
    fn running_replies_follow_their_runs_steps_and_ends() {
        let f = quick();
        let lists = watch(&f);
        let (run_id, reply) = f.start("echo");
        let last = |lists: &Arc<Mutex<Vec<Vec<RunningReply>>>>| {
            lists.lock().unwrap().last().cloned().unwrap()
        };
        let running = last(&lists);
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].message_id, reply);
        assert_eq!(running[0].project_name, "Test Project");
        assert_eq!(running[0].conversation_title, "New conversation");
        assert_eq!(running[0].step, None);

        f.step(run_id, STEP);
        assert_eq!(last(&lists)[0].step.as_deref(), Some("Test"));

        f.runs.handle(SidecarFrame::RunDone { run_id });
        assert!(last(&lists).is_empty());
    }

    #[test]
    fn a_paused_reply_is_not_running() {
        let f = quick();
        let lists = watch(&f);
        paused(&f);
        assert!(lists.lock().unwrap().last().unwrap().is_empty());
        assert!(f.runs.running().is_empty());
    }

    #[test]
    fn errors_and_cancellations_end_the_reply() {
        let f = quick();
        let (failing, failed_reply) = f.start("echo");
        f.runs.handle(SidecarFrame::RunError {
            run_id: failing,
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
        f.runs.handle(SidecarFrame::RunCancelled { run_id: cancelled });
        assert_eq!(f.status(cancelled_reply), MessageStatus::Cancelled);
    }

    #[test]
    fn frames_after_the_end_are_ignored() {
        let f = quick();
        let (run_id, reply) = f.start("echo");
        f.runs.handle(SidecarFrame::RunDone { run_id });
        let before = f.reply_events(reply).len();
        f.runs.handle(SidecarFrame::RunDelta { run_id, text: "late".into() });
        f.runs.handle(SidecarFrame::RunError {
            run_id,
            error: ErrorInfo { code: "trait_error".into(), message: String::new() },
        });
        assert_eq!(f.reply_events(reply).len(), before);
        assert_eq!(f.status(reply), MessageStatus::Complete);
    }

    #[test]
    fn stopping_a_reply_cancels_its_run_and_closes_it_after_the_timeout() {
        let f = fixture(Box::new(NoSecrets), Duration::from_millis(50));
        let (run_id, reply) = f.start("echo");
        let call_id = f.step(run_id, STEP);
        let stopped = stop_reply(&f.project, f.conversation_of(reply)).unwrap();
        assert_eq!(stopped, vec![reply]);
        for message_id in stopped {
            f.runs.cancel_message(message_id);
        }
        assert!(f.sink.frames().contains(&CoreFrame::RunCancel { run_id }));

        f.runs.handle(SidecarFrame::RunDelta { run_id, text: "more".into() });
        assert!(!f
            .reply_events(reply)
            .iter()
            .any(|e| matches!(e, EventKind::MessageDelta { .. })));

        std::thread::sleep(Duration::from_millis(200));
        let response = f.runs.respond("r1".into(), call_id, "asset.read", json!({}));
        assert!(matches!(response, CoreFrame::CoreResponse { error: Some(e), .. } if e.code == "call_not_active"));
    }

    #[test]
    fn disconnecting_fails_open_replies() {
        let f = quick();
        let (_, first) = f.start("echo");
        let (_, second) = f.start("echo");
        f.runs.disconnect();
        for reply in [first, second] {
            match f.reply_events(reply).last().unwrap() {
                EventKind::MessageFailed { error, .. } => assert_eq!(error.code, SIDECAR_STOPPED),
                other => panic!("expected message.failed, got {other:?}"),
            }
        }
        let message = f.project.lock().load_message(first).unwrap().unwrap().1;
        let err = f
            .runs
            .start(Arc::clone(&f.project), f.conversation, &message, spec("echo", json!({})), None)
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

    fn papers() -> Value {
        json!({ "papers": [{ "title": "Late blight resistance in wild potato", "year": 2021 }] })
    }

    fn add_component(f: &Fixture, call_id: Uuid, params: Value) -> CoreFrame {
        f.runs.respond("r".into(), call_id, "component.add", params)
    }

    #[test]
    fn a_call_can_ask_to_edit_only_a_document_its_message_references() {
        let f = quick();
        let (call_id, _) = f.start_call("echo");
        let report = crate::documents::create(&f.project, "Report", None, &user()).unwrap();
        let edit = json!({ "find": "Report", "replace": "Trial report", "reason": "Clearer." });
        let params = json!({ "asset_id": report.id, "edits": [edit] });
        let refused = f.runs.respond("r".into(), call_id, "document.edit", params);
        assert_eq!(error_code(refused).as_deref(), Some("document_not_referenced"));
    }

    #[test]
    fn a_trait_cannot_add_a_document_edits_card() {
        let f = quick();
        let (call_id, _) = f.start_call("echo");
        let params = json!({ "kind": "document-edits", "version": 1, "data": {}, "text": "t" });
        let refused = add_component(&f, call_id, params);
        assert_eq!(error_code(refused).as_deref(), Some("component_not_allowed"));
    }

    #[test]
    fn a_valid_component_is_added_to_the_reply() {
        let f = quick();
        let (call_id, reply) = f.start_call("echo");
        let params = json!({
            "kind": "paper-sources", "version": 1, "data": papers(), "text": "1. Late blight"
        });
        let id = result(add_component(&f, call_id, params))["component_id"].clone();

        let message = f.message(reply);
        assert_eq!(message.components.len(), 1);
        assert_eq!(json!(message.components[0].id), id);
        assert_eq!(message.components[0].kind, "paper-sources");
    }

    #[test]
    fn a_component_records_the_step_run_that_added_it() {
        let f = quick();
        let (run_id, reply) = f.start("echo");
        f.step(run_id, STEP);
        f.runs.handle(SidecarFrame::StepCompleted { run_id, step_id: STEP.into(), output: None });
        let call_id = f.step(run_id, STEP);
        let params = json!({
            "kind": "paper-sources", "version": 1, "data": papers(), "text": "1. Late blight"
        });
        result(add_component(&f, call_id, params));

        assert_eq!(f.message(reply).components[0].step_index, Some(1));
    }

    #[test]
    fn a_call_in_a_thread_lists_the_threads_document_first() {
        let f = quick();
        let (call_id, reply) = f.start_call("echo");
        let (conversation, _) = f.project.lock().message_place(reply).unwrap().unwrap();
        into_thread(&f.project, conversation);
        let listed = result(f.runs.respond("r".into(), call_id, "conversation.results", json!({})));
        let first = &listed["assets"][0];
        assert_eq!(first["name"], "Thread document.qmd");
        assert_eq!(first["current"], true);
    }

    #[test]
    fn a_call_lists_its_conversations_components_and_reads_one_in_full() {
        let f = quick();
        let (call_id, _) = f.start_call("echo");
        let params = json!({
            "kind": "paper-sources", "version": 1, "data": papers(), "text": "1. Late blight"
        });
        let id = result(add_component(&f, call_id, params))["component_id"].clone();

        let listed = result(f.runs.respond("r".into(), call_id, "conversation.results", json!({})));
        assert_eq!(listed["components"][0]["id"], id);
        assert_eq!(listed["components"][0]["kind"], json!("paper-sources"));
        assert_eq!(listed["assets"], json!([]));

        let read = |component_id: Value| {
            let params = json!({ "component_id": component_id });
            f.runs.respond("r".into(), call_id, "component.read", params)
        };
        assert_eq!(result(read(id))["data"], papers());
        assert_eq!(error_code(read(json!(new_id()))).as_deref(), Some("not_found"));
    }

    #[test]
    fn an_approval_or_a_component_without_text_is_refused() {
        let f = quick();
        let (call_id, reply) = f.start_call("echo");
        let approval = json!({ "kind": "approval", "version": 1, "data": {}, "text": "t" });
        assert_eq!(
            error_code(add_component(&f, call_id, approval)).as_deref(),
            Some("component_not_allowed")
        );

        let empty = json!({ "kind": "paper-sources", "version": 1, "data": papers(), "text": " " });
        assert_eq!(
            error_code(add_component(&f, call_id, empty)).as_deref(),
            Some("invalid_component")
        );

        let message = f.message(reply);
        assert!(message.components.is_empty());
        assert_eq!(message.status, MessageStatus::Streaming);
    }

    #[test]
    fn a_request_after_its_step_completed_is_refused() {
        let f = quick();
        let (run_id, reply) = f.start("echo");
        let call_id = f.step(run_id, STEP);
        f.runs.handle(SidecarFrame::StepCompleted { run_id, step_id: STEP.into(), output: None });
        let params =
            json!({ "kind": "paper-sources", "version": 1, "data": papers(), "text": "t" });
        assert_eq!(
            error_code(add_component(&f, call_id, params)).as_deref(),
            Some("call_not_active")
        );
        assert!(f.message(reply).components.is_empty());
    }

    fn write_asset(f: &Fixture, call_id: Uuid, name: &str, content: &[u8]) -> CoreFrame {
        let data = BASE64.encode(content);
        let params = json!({ "name": name, "media_type": "application/json", "data": data });
        f.runs.respond("r".into(), call_id, "asset.write", params)
    }

    #[test]
    fn a_written_asset_is_attached_to_the_reply() {
        let f = quick();
        let (call_id, reply) = f.start_call("echo");
        let written = result(write_asset(&f, call_id, "theory-store.json", b"{\"theories\": []}"));
        assert_eq!(written["asset"]["name"], "theory-store.json");

        let message = f.message(reply);
        assert_eq!(message.attachments.len(), 1);
        let path = assets::file_path(&f.project, message.attachments[0].id).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"{\"theories\": []}");
    }

    #[test]
    fn an_asset_written_after_the_run_ended_is_refused_and_not_stored() {
        let f = quick();
        let (run_id, _) = f.start("echo");
        let call_id = f.step(run_id, STEP);
        f.runs.handle(SidecarFrame::RunDone { run_id });
        let response = write_asset(&f, call_id, "theory-store.json", b"{}");
        assert_eq!(error_code(response).as_deref(), Some("call_not_active"));
        assert!(assets::list(&f.project, None).unwrap().is_empty());
    }

    #[test]
    fn an_asset_with_a_path_in_its_name_is_refused() {
        let f = quick();
        let (call_id, reply) = f.start_call("echo");
        let response = write_asset(&f, call_id, "../../notes.txt", b"x");
        assert_eq!(error_code(response).as_deref(), Some("invalid_input"));
        assert!(assets::list(&f.project, None).unwrap().is_empty());
        assert!(f.message(reply).attachments.is_empty());
    }

    #[test]
    fn assets_are_read_in_chunks_within_the_project() {
        let f = quick();
        let (call_id, _) = f.start_call("echo");
        let source_dir = tempfile::tempdir().unwrap();
        let source = source_dir.path().join("trial.bin");
        let content: Vec<u8> = (0..(ASSET_CHUNK_BYTES * 5 / 2)).map(|i| (i % 251) as u8).collect();
        std::fs::write(&source, &content).unwrap();
        let asset = assets::import(&f.project, &source, &user()).unwrap();

        let mut read = Vec::new();
        let mut responses = 0;
        loop {
            let chunk = result(f.runs.respond(
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
        let foreign = assets::import(&other, &source, &user()).unwrap();
        let response = f.runs.respond(
            "r".into(),
            call_id,
            "asset.read",
            json!({ "asset_id": foreign.id, "offset": 0, "length": 10 }),
        );
        assert_eq!(error_code(response).as_deref(), Some("not_found"));

        let response = f.runs.respond("r".into(), call_id, "files.delete", json!({}));
        assert_eq!(error_code(response).as_deref(), Some("unknown_method"));
    }

    #[test]
    fn secrets_go_only_to_declared_providers() {
        let f = fixture(Box::new(MemorySecrets::dummy()), CANCEL_TIMEOUT);
        let (echo_call, _) = f.start_call("echo");
        let response =
            f.runs.respond("r".into(), echo_call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(error_code(response).as_deref(), Some("secret_not_allowed"));

        let (run_id, reply) = f.start("test-use-secret");
        let secret_call = f.step(run_id, STEP);
        let response =
            f.runs.respond("r".into(), secret_call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(result(response)["value"], json!("sk-dummy-0123456789"));
        f.runs.handle(SidecarFrame::RunDone { run_id });
        let persisted = format!("{:?}", f.reply_events(reply));
        assert!(!persisted.contains("sk-dummy"));

        let g = fixture(Box::new(NoSecrets), CANCEL_TIMEOUT);
        let (call, _) = g.start_call("test-use-secret");
        let response = g.runs.respond("r".into(), call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(error_code(response).as_deref(), Some("secret_unavailable"));
    }

    #[test]
    fn secrets_go_only_to_the_runs_own_provider() {
        let f = fixture(Box::new(MemorySecrets::dummy()), CANCEL_TIMEOUT);
        let (call, _) = f.start_call("prompt");
        let response =
            f.runs.respond("r".into(), call, "secret.get", json!({ "provider": "openai" }));
        assert_eq!(error_code(response).as_deref(), Some("secret_not_allowed"));
        let response =
            f.runs.respond("r".into(), call, "secret.get", json!({ "provider": "dummy" }));
        assert_eq!(result(response)["value"], json!("sk-dummy-0123456789"));
    }

    /// A run of `adapter` whose Workflow is a condition with one Trait Step per branch.
    fn deciding_spec(adapter: &str) -> RunSpec {
        let mut run = spec(adapter, json!({ "text": "late blight" }));
        let branch = |label: &str| crate::library::Branch {
            label: label.into(),
            steps: vec![Step {
                id: label.into(),
                label: None,
                kind: StepKind::Trait { trait_id: Uuid::nil() },
            }],
        };
        run.workflow.steps = vec![Step {
            id: "pick".into(),
            label: None,
            kind: StepKind::Condition {
                question: "Which?".into(),
                branches: vec![branch("one"), branch("two")],
            },
        }];
        run
    }

    #[test]
    fn a_decision_may_only_get_the_runs_ai_key() {
        let f = fixture(Box::new(MemorySecrets::dummy()), CANCEL_TIMEOUT);
        let (run_id, reply) = f.start_spec(deciding_spec("echo"), dummy_model());
        let decision = f.step(run_id, "pick");
        let ask = |method: &str, params: Value| f.runs.respond("r".into(), decision, method, params);
        let read = json!({ "asset_id": Uuid::nil(), "offset": 0, "length": 1 });
        assert_eq!(error_code(ask("asset.read", read)).as_deref(), Some("unknown_method"));
        let add = json!({ "kind": "paper-sources", "version": 1, "data": papers(), "text": "t" });
        assert_eq!(error_code(ask("component.add", add)).as_deref(), Some("unknown_method"));
        assert_eq!(
            error_code(ask("conversation.results", json!({}))).as_deref(),
            Some("unknown_method")
        );
        let read_component = json!({ "component_id": Uuid::nil() });
        assert_eq!(
            error_code(ask("component.read", read_component)).as_deref(),
            Some("unknown_method")
        );
        assert_eq!(
            error_code(ask("secret.get", json!({ "provider": "openai" }))).as_deref(),
            Some("secret_not_allowed")
        );
        let key = result(ask("secret.get", json!({ "provider": "dummy" })));
        assert_eq!(key["value"], json!("sk-dummy-0123456789"));
        let steps = f.message(reply).steps;
        assert_eq!((steps[0].name.as_str(), steps[0].step_type.as_str()), ("Condition", "condition"));
    }

    #[test]
    fn a_missing_model_fails_the_reply_without_a_run() {
        let f = quick();
        let sent_before = f.sink.frames().len();
        let message = f.send(f.conversation, "summarize");
        let reply = f
            .runs
            .start(Arc::clone(&f.project), f.conversation, &message, spec("prompt", json!({})), None)
            .unwrap();
        match f.reply_events(reply).last().unwrap() {
            EventKind::MessageFailed { error, .. } => assert_eq!(error.code, "model_not_set"),
            other => panic!("expected message.failed, got {other:?}"),
        }
        assert_eq!(f.sink.frames().len(), sent_before);

        // A decision needs the model even when no adapter calls an AI provider.
        let conversation = create(&f.project).unwrap().id;
        let message = f.send(conversation, "pick one");
        let reply = f
            .runs
            .start(Arc::clone(&f.project), conversation, &message, deciding_spec("echo"), None)
            .unwrap();
        assert_eq!(f.status(reply), MessageStatus::Failed);
    }

    #[test]
    fn runs_without_ai_adapters_or_decisions_get_no_model() {
        let f = quick();
        f.start("echo");
        let sent = f.sink.frames().into_iter().find_map(|frame| match frame {
            CoreFrame::RunStart { model, .. } => Some(model),
            _ => None,
        });
        assert_eq!(sent, Some(None));
    }

    /// A run of `echo` whose Workflow is an approval, then a Trait Step.
    fn approving_spec() -> RunSpec {
        let mut run = spec("echo", json!({ "text": "late blight" }));
        let ask = Step {
            id: "ask".into(),
            label: None,
            kind: StepKind::Approval { prompt: "Go on?".into() },
        };
        run.workflow.steps.insert(0, ask);
        run
    }

    /// Starts an approving run and pauses it at its approval; returns the reply and its
    /// approval's ID.
    fn paused(f: &Fixture) -> (Uuid, Uuid) {
        let (run_id, reply) = f.start_spec(approving_spec(), None);
        f.runs.handle(SidecarFrame::StepStarted { run_id, step_id: "ask".into(), call_id: None });
        f.runs.handle(SidecarFrame::RunPaused {
            run_id,
            step_id: "ask".into(),
            output: Some("so far".into()),
            state: "opaque".into(),
        });
        let message = f.message(reply);
        assert_eq!(message.status, MessageStatus::Paused);
        (reply, message.components[0].id)
    }

    #[test]
    fn an_approved_run_resumes_with_a_new_run_and_its_state() {
        let f = quick();
        let (reply, approval) = paused(&f);
        let first_run = f.sink.last_run();
        let saved = conversations::answer_approval(&f.project, reply, approval, true).unwrap();
        f.runs.resume(Arc::clone(&f.project), f.conversation_of(reply), saved, None);

        let resumed = f.sink.frames().into_iter().rev().find_map(|frame| match frame {
            CoreFrame::RunStart { run_id, plan, resume, .. } => Some((run_id, plan, resume)),
            _ => None,
        });
        let (run_id, plan, resume) = resumed.unwrap();
        assert_ne!(run_id, first_run);
        assert_eq!(plan.workflow, approving_spec().workflow);
        assert_eq!(plan.context.message.content, "late blight spreads");
        let resume = resume.unwrap();
        assert_eq!((resume.state.as_str(), resume.step_id.as_str()), ("opaque", "ask"));

        f.runs.handle(SidecarFrame::RunDelta { run_id, text: "done".into() });
        f.runs.handle(SidecarFrame::RunDone { run_id });
        let message = f.message(reply);
        assert_eq!((message.status, message.content.as_str()), (MessageStatus::Complete, "done"));
        let ask = &message.steps[0];
        assert_eq!((ask.step_type.as_str(), ask.done), ("approval", true));
    }

    #[test]
    fn a_rejected_run_completes_with_its_output_and_does_not_resume() {
        let f = quick();
        let (reply, approval) = paused(&f);
        let sent_before = f.sink.frames().len();
        conversations::answer_approval(&f.project, reply, approval, false).unwrap();
        let message = f.message(reply);
        assert_eq!((message.status, message.content.as_str()), (MessageStatus::Complete, "so far"));
        assert_eq!(f.sink.frames().len(), sent_before);
        let again = conversations::answer_approval(&f.project, reply, approval, false);
        assert_eq!(again.unwrap_err().code, "not_paused");
    }

    #[test]
    fn a_resume_state_over_the_limit_fails_the_reply() {
        let f = quick();
        let (run_id, reply) = f.start_spec(approving_spec(), None);
        f.runs.handle(SidecarFrame::RunPaused {
            run_id,
            step_id: "ask".into(),
            output: None,
            state: "x".repeat(MAX_STATE_BYTES + 1),
        });
        match f.reply_events(reply).last().unwrap() {
            EventKind::MessageFailed { error, .. } => assert_eq!(error.code, "state_too_large"),
            other => panic!("expected message.failed, got {other:?}"),
        }
    }

    /// Starts a routing request on another thread; returns its route ID and the outcome.
    fn start_route(
        f: &Fixture,
        timeout: Duration,
    ) -> (Uuid, std::thread::JoinHandle<AppResult<RouteAnswers>>) {
        let runs = Arc::clone(&f.runs);
        let handle = std::thread::spawn(move || {
            let ask = vec!["reaction".into()];
            runs.route(json!({ "message": "hi" }), Vec::new(), Vec::new(), ask, timeout)
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
        f.runs.handle(SidecarFrame::RouteDone { route_id, answers: answers.clone() });
        assert_eq!(handle.join().unwrap().unwrap(), answers);
    }

    #[test]
    fn a_routing_request_times_out_or_ends_with_the_sidecar() {
        let f = quick();
        let (_, handle) = start_route(&f, Duration::from_millis(50));
        assert_eq!(handle.join().unwrap().unwrap_err().code, "jev_timeout");

        let g = quick();
        let (_, handle) = start_route(&g, CANCEL_TIMEOUT);
        g.runs.disconnect();
        assert_eq!(handle.join().unwrap().unwrap_err().code, SIDECAR_STOPPED);
    }

    /// Starts a summary request on another thread; returns its summary ID and the outcome.
    fn start_summary(
        f: &Fixture,
        timeout: Duration,
    ) -> (Uuid, std::thread::JoinHandle<AppResult<String>>) {
        let runs = Arc::clone(&f.runs);
        let handle = std::thread::spawn(move || {
            let model = CallModel { provider: "openai".into(), model: "gpt-x".into() };
            runs.summarize(model, "## Trial\nYou: plot yield".into(), timeout)
        });
        let summary_id = loop {
            let found = f.sink.frames().into_iter().find_map(|frame| match frame {
                CoreFrame::SummaryStart { summary_id, .. } => Some(summary_id),
                _ => None,
            });
            if let Some(summary_id) = found {
                break summary_id;
            }
            std::thread::sleep(Duration::from_millis(5));
        };
        (summary_id, handle)
    }

    #[test]
    fn a_summary_request_returns_the_text_or_the_sidecars_error() {
        let f = quick();
        let (summary_id, handle) = start_summary(&f, CANCEL_TIMEOUT);
        f.runs.handle(SidecarFrame::SummaryDone { summary_id, text: "Yield rose.".into() });
        assert_eq!(handle.join().unwrap().unwrap(), "Yield rose.");

        let g = quick();
        let (summary_id, handle) = start_summary(&g, CANCEL_TIMEOUT);
        let error = ErrorInfo { code: "provider_refused".into(), message: "Refused.".into() };
        g.runs.handle(SidecarFrame::SummaryError { summary_id, error });
        assert_eq!(handle.join().unwrap().unwrap_err().code, "provider_refused");
    }

    #[test]
    fn a_summary_request_times_out_or_ends_with_the_sidecar() {
        let f = quick();
        let (_, handle) = start_summary(&f, Duration::from_millis(50));
        assert_eq!(handle.join().unwrap().unwrap_err().code, "summary_timeout");

        let g = quick();
        let (_, handle) = start_summary(&g, CANCEL_TIMEOUT);
        g.runs.disconnect();
        assert_eq!(handle.join().unwrap().unwrap_err().code, SIDECAR_STOPPED);
    }

    #[test]
    fn a_summary_request_may_only_get_its_models_key() {
        let secrets = MemorySecrets(HashMap::from([
            ("typesafe".to_string(), "ts-key".to_string()),
            ("openai".to_string(), "sk-openai".to_string()),
        ]));
        let f = fixture(Box::new(secrets), CANCEL_TIMEOUT);
        let (summary_id, handle) = start_summary(&f, CANCEL_TIMEOUT);
        let ask = |provider: &str| {
            f.runs.respond("r".into(), summary_id, "secret.get", json!({ "provider": provider }))
        };
        assert_eq!(error_code(ask("typesafe")).as_deref(), Some("secret_not_allowed"));
        assert_eq!(error_code(ask("openai")), None);
        f.runs.handle(SidecarFrame::SummaryDone { summary_id, text: String::new() });
        handle.join().unwrap().unwrap();
    }

    /// Waits until the sink has a frame `pick` accepts, and returns what it picked.
    fn wait_for<T>(f: &Fixture, pick: impl Fn(CoreFrame) -> Option<T>) -> T {
        loop {
            if let Some(found) = f.sink.frames().into_iter().find_map(&pick) {
                return found;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    type DraftOutcome = ((String, Option<AppError>), Vec<DraftEvent>);

    fn start_draft(f: &Fixture, idle: Duration) -> (Uuid, std::thread::JoinHandle<DraftOutcome>) {
        let runs = Arc::clone(&f.runs);
        let draft_id = new_id();
        let handle = std::thread::spawn(move || {
            let model = CallModel { provider: "openai".into(), model: "gpt-x".into() };
            let mut events = Vec::new();
            let outcome = runs.draft(draft_id, model, "Trial".into(), "You: hi".into(), idle, |e| {
                events.push(e.clone())
            });
            (outcome, events)
        });
        wait_for(f, |frame| match frame {
            CoreFrame::DraftStart { draft_id: id, .. } if id == draft_id => Some(()),
            _ => None,
        });
        (draft_id, handle)
    }

    #[test]
    fn a_draft_streams_its_text_and_a_stopped_draft_keeps_it() {
        let f = quick();
        let (draft_id, handle) = start_draft(&f, CANCEL_TIMEOUT);
        f.runs.handle(SidecarFrame::DraftDelta { draft_id, text: "# Summary\n".into() });
        f.runs.handle(SidecarFrame::DraftDelta { draft_id, text: "Yield fell.".into() });
        f.runs.cancel_draft(draft_id);
        wait_for(&f, |frame| match frame {
            CoreFrame::DraftCancel { draft_id: id } if id == draft_id => Some(()),
            _ => None,
        });
        f.runs.handle(SidecarFrame::DraftDone { draft_id });
        let ((text, ending), events) = handle.join().unwrap();
        assert_eq!(text, "# Summary\nYield fell.");
        assert!(ending.is_none());
        assert_eq!(events.len(), 3);
        assert_eq!(events[2], DraftEvent::Done);
    }

    #[test]
    fn a_draft_stopped_before_it_starts_writes_nothing() {
        let f = quick();
        let draft_id = new_id();
        f.runs.cancel_draft(draft_id);
        let model = CallModel { provider: "openai".into(), model: "gpt-x".into() };
        let (text, ending) =
            f.runs.draft(draft_id, model, "Trial".into(), "You: hi".into(), CANCEL_TIMEOUT, |_| {});
        assert!(text.is_empty() && ending.is_none());
        assert!(!f.sink.frames().iter().any(|frame| matches!(frame, CoreFrame::DraftStart { .. })));
    }

    #[test]
    fn a_failed_or_silent_draft_keeps_its_text_and_says_why() {
        let f = quick();
        let (draft_id, handle) = start_draft(&f, CANCEL_TIMEOUT);
        f.runs.handle(SidecarFrame::DraftDelta { draft_id, text: "Partial".into() });
        let error = ErrorInfo { code: "provider_refused".into(), message: "Refused.".into() };
        f.runs.handle(SidecarFrame::DraftError { draft_id, error });
        let ((text, ending), _) = handle.join().unwrap();
        assert_eq!((text.as_str(), ending.unwrap().code.as_str()), ("Partial", "provider_refused"));

        let g = quick();
        let (_, handle) = start_draft(&g, Duration::from_millis(50));
        let ((_, ending), _) = handle.join().unwrap();
        assert_eq!(ending.unwrap().code, "draft_timeout");
    }

    #[test]
    fn a_draft_may_only_get_its_models_key() {
        let secrets = MemorySecrets(HashMap::from([
            ("typesafe".to_string(), "ts-key".to_string()),
            ("openai".to_string(), "sk-openai".to_string()),
        ]));
        let f = fixture(Box::new(secrets), CANCEL_TIMEOUT);
        let (draft_id, handle) = start_draft(&f, CANCEL_TIMEOUT);
        let ask = |provider: &str| {
            f.runs.respond("r".into(), draft_id, "secret.get", json!({ "provider": provider }))
        };
        assert_eq!(error_code(ask("typesafe")).as_deref(), Some("secret_not_allowed"));
        assert_eq!(error_code(ask("openai")), None);
        f.runs.handle(SidecarFrame::DraftDone { draft_id });
        handle.join().unwrap();
    }

    #[test]
    fn an_export_returns_the_pdf_or_the_sidecars_error() {
        let f = quick();
        let runs = Arc::clone(&f.runs);
        let handle = std::thread::spawn(move || {
            runs.export_pdf("Report.qmd".into(), "# A".into(), CANCEL_TIMEOUT)
        });
        let export_id = wait_for(&f, |frame| match frame {
            CoreFrame::DocumentExport { export_id, name, .. } if name == "Report.qmd" => {
                Some(export_id)
            }
            _ => None,
        });
        f.runs.handle(SidecarFrame::DocumentExported { export_id, data: BASE64.encode(b"%PDF-1.7") });
        assert_eq!(handle.join().unwrap().unwrap(), b"%PDF-1.7");

        let g = quick();
        let runs = Arc::clone(&g.runs);
        let handle = std::thread::spawn(move || {
            runs.export_pdf("Report.qmd".into(), "# A".into(), CANCEL_TIMEOUT)
        });
        let export_id = wait_for(&g, |frame| match frame {
            CoreFrame::DocumentExport { export_id, .. } => Some(export_id),
            _ => None,
        });
        let error = ErrorInfo { code: "export_failed".into(), message: "No.".into() };
        g.runs.handle(SidecarFrame::DocumentExportError { export_id, error });
        assert_eq!(handle.join().unwrap().unwrap_err().code, "export_failed");
    }

    #[test]
    fn a_preview_returns_the_pages_or_the_sidecars_error() {
        let f = quick();
        let runs = Arc::clone(&f.runs);
        let handle = std::thread::spawn(move || runs.preview("# A".into(), CANCEL_TIMEOUT));
        let preview_id = wait_for(&f, |frame| match frame {
            CoreFrame::DocumentPreview { preview_id, .. } => Some(preview_id),
            _ => None,
        });
        let pages = vec!["<svg>1</svg>".to_string(), "<svg>2</svg>".to_string()];
        f.runs.handle(SidecarFrame::DocumentPreviewed { preview_id, pages: pages.clone() });
        assert_eq!(handle.join().unwrap().unwrap(), pages);

        let g = quick();
        let runs = Arc::clone(&g.runs);
        let handle = std::thread::spawn(move || runs.preview("# A".into(), CANCEL_TIMEOUT));
        let preview_id = wait_for(&g, |frame| match frame {
            CoreFrame::DocumentPreview { preview_id, .. } => Some(preview_id),
            _ => None,
        });
        let error = ErrorInfo { code: "preview_failed".into(), message: "No.".into() };
        g.runs.handle(SidecarFrame::DocumentPreviewError { preview_id, error });
        assert_eq!(handle.join().unwrap().unwrap_err().code, "preview_failed");
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
            |method: &str, params: Value| f.runs.respond("r".into(), route_id, method, params);
        let read = json!({ "asset_id": Uuid::nil(), "offset": 0, "length": 1 });
        assert_eq!(error_code(ask("asset.read", read)).as_deref(), Some("unknown_method"));
        assert_eq!(
            error_code(ask("secret.get", json!({ "provider": "openai" }))).as_deref(),
            Some("secret_not_allowed")
        );
        let key = result(ask("secret.get", json!({ "provider": "typesafe" })));
        assert_eq!(key["value"], json!("ts-key"));
        f.runs.handle(SidecarFrame::RouteError {
            route_id,
            error: ErrorInfo { code: "jev_unavailable".into(), message: String::new() },
        });
        assert_eq!(handle.join().unwrap().unwrap_err().code, "jev_unavailable");
    }

    #[test]
    fn a_follow_up_call_gets_the_earlier_exchange_as_history() {
        let f = quick();
        let ask = |content: &str| {
            let message = f.send(f.conversation, content);
            let spec = spec("echo", json!({}));
            f.runs.start(Arc::clone(&f.project), f.conversation, &message, spec, None).unwrap();
            let run_id = f.sink.last_run();
            (run_id, f.step(run_id, STEP))
        };
        let (first, _) = ask("summarize the trial");
        f.runs.handle(SidecarFrame::RunDelta { run_id: first, text: "It worked.".into() });
        f.runs.handle(SidecarFrame::RunDone { run_id: first });
        let (_, second) = ask("make it shorter");

        let response = f.runs.respond("r".into(), second, "conversation.history", json!({}));
        let history = result(response);
        let contents: Vec<&str> = history["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["content"].as_str().unwrap())
            .collect();
        assert_eq!(contents, ["summarize the trial", "It worked."]);
        assert_eq!(history["messages"][0]["name"], json!("You"));
        assert_eq!(history["truncated"], json!(false));
    }

    #[test]
    fn an_adapter_with_only_a_non_ai_key_runs_without_a_model_and_gets_that_key() {
        let secrets = MemorySecrets(HashMap::from([("ai2".to_string(), "ai2-token".to_string())]));
        let f = fixture(Box::new(secrets), CANCEL_TIMEOUT);
        f.runs.connect(
            Arc::clone(&f.sink) as Arc<dyn FrameSink>,
            vec![info("asta-paper-finder", &["ai2"])],
        );
        let finder = spec("asta-paper-finder", json!({ "text": "late blight" }));
        let (run_id, reply) = f.start_spec(finder, None);
        let call = f.step(run_id, STEP);
        assert_eq!(f.status(reply), MessageStatus::Streaming);
        let response = f.runs.respond("r".into(), call, "secret.get", json!({ "provider": "ai2" }));
        assert_eq!(result(response)["value"], json!("ai2-token"));
    }

    #[test]
    fn a_reply_in_a_thread_is_not_listed_as_running() {
        let f = quick();
        let (_, reply) = f.start("echo");
        let (conversation, _) = f.project.lock().message_place(reply).unwrap().unwrap();
        into_thread(&f.project, conversation);
        assert!(f.runs.running().is_empty());
    }
}
