//! Tauri commands and the per-Conversation event channel.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::ai2::{Ai2, Ai2Status, AppSecrets};
use crate::approvals::{self, PausedApproval};
use crate::assets;
use crate::comments;
use crate::conversations::{self, ConversationSummary, SendMessageInput};
use crate::documents;
use crate::error::{AppError, AppResult};
use crate::projects::{self, ProjectSummary};
use crate::recent::{self, RecentConversation};
use crate::protocol::{AssetRef, Author, AuthorKind, Event, Message, OpenedConversation, now_ms};
use crate::history::HISTORY_BUDGET_CHARS;
use crate::library::{MiniMe, MiniMeSummary, TraitSummary};
use crate::user_library::{LibraryStore, Skipped, TraitDraft};
use crate::user_profile::{ProfileStore, UserProfile};
use crate::overview;
use crate::routing::{ROUTE_TIMEOUT, RouteSettings, Routing};
use crate::runs::{CANCEL_TIMEOUT, DraftEvent, RunningReply, Runs};
use crate::secrets::{self, KeychainSecrets};
use crate::settings::{AiSettings, HomeSettings, Settings};
use crate::sidecar::{Launch, SidecarLog, SidecarState, SidecarStatus, Supervisor, Timing};
use crate::store::{EventSink, Project};
use crate::updates::{UpdateStatus, Updates};

/// How much of a Project's message text a summary is written from: whole Conversations,
/// newest first, up to four times the history of one call.
const SUMMARY_BUDGET_CHARS: usize = HISTORY_BUDGET_CHARS * 4;

/// How long a summary may take; long material can keep the model writing for a while.
const SUMMARY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);

/// How long a draft may go without new text before it is stopped.
const DRAFT_IDLE: std::time::Duration = std::time::Duration::from_secs(90);

/// How long making a PDF may take.
const EXPORT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);

/// The key account Jev's routing uses.
const TYPESAFE: &str = "typesafe";

pub struct AppState {
    config_dir: PathBuf,
    /// Whether this app is Mini-Me Dev, which has Developer mode on until the user turns it off.
    dev_app: bool,
    data_root: PathBuf,
    settings: Mutex<Settings>,
    open_projects: Mutex<HashMap<Uuid, Arc<Project>>>,
    runs: Arc<Runs>,
    routing: Arc<Routing>,
    library: Arc<LibraryStore>,
    profile: ProfileStore,
    pub sidecar: Arc<Supervisor>,
    pub updates: Arc<Updates>,
    ai2: Arc<Ai2>,
    /// The paths of the latest drop on the window, as the operating system reported them.
    dropped: Mutex<Vec<PathBuf>>,
}

impl AppState {
    pub fn init(app: &AppHandle) -> AppResult<Self> {
        // The identifier tells Mini-Me from Mini-Me Dev; Tauri already keeps each one's
        // settings and logs apart by it, and the Projects folder and keychain follow it here.
        let identifier = app.config().identifier.clone();
        secrets::use_keychain_service(&identifier);
        let path = app.path();
        let config_dir = path
            .app_config_dir()
            .map_err(|e| AppError::storage(e.to_string()))?;
        let documents = path
            .document_dir()
            .map_err(|e| AppError::storage(e.to_string()))?;
        let log_dir = path
            .app_log_dir()
            .map_err(|e| AppError::storage(e.to_string()))?;
        let launch = if cfg!(debug_assertions) {
            Launch::dev()
        } else {
            let resources = path
                .resource_dir()
                .map_err(|e| AppError::storage(e.to_string()))?;
            Launch::release(&resources)
        };
        let log = Arc::new(SidecarLog::new(&log_dir));
        let data_root =
            projects::ensure_data_root(&documents, projects::data_folder_name(&identifier))?;
        let library = Arc::new(LibraryStore::open(&data_root));
        let profile = ProfileStore::open(&data_root);
        let ai2 = Ai2::system();
        let runs = Arc::new(Runs::new(
            Box::new(AppSecrets {
                ai2: Arc::clone(&ai2),
            }),
            Arc::clone(&log),
            CANCEL_TIMEOUT,
            Arc::clone(&library),
        ));
        let sidecar = Supervisor::new(
            launch,
            false,
            Timing::for_build(),
            Arc::clone(&runs),
            Arc::clone(&log),
        );
        sidecar.spawn();
        let updates = Updates::new(log);
        // Mini-Me Dev has no update feed of its own, and must never install Mini-Me's.
        if !cfg!(debug_assertions) && !projects::is_mini_me_dev(&identifier) {
            updates.spawn(app.clone());
        }
        Ok(Self {
            dev_app: projects::is_mini_me_dev(&identifier),
            settings: Mutex::new(Settings::load_or_create(&config_dir)?),
            data_root,
            config_dir,
            open_projects: Mutex::new(HashMap::new()),
            runs,
            routing: Routing::new(
                Arc::clone(&library),
                KeychainSecrets::saved().iter().any(|k| k == TYPESAFE),
            ),
            library,
            profile,
            sidecar,
            updates,
            ai2,
            dropped: Mutex::new(Vec::new()),
        })
    }

    /// Remembers the paths of a drop on the window, replacing those of the previous drop.
    pub fn record_drop(&self, paths: Vec<PathBuf>) {
        *self.dropped.lock().unwrap_or_else(|p| p.into_inner()) = paths;
    }

    /// Whether developer options and the web inspector are available.
    pub fn developer_mode(&self) -> bool {
        self.settings().developer_mode(self.dev_app)
    }

    fn settings(&self) -> Settings {
        self.settings.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    fn user(&self) -> Author {
        Author {
            kind: AuthorKind::User,
            id: self.settings().user_id.to_string(),
        }
    }

    fn find_summary(&self, project_id: Uuid) -> AppResult<ProjectSummary> {
        projects::list(&self.data_root, &HashMap::new())?
            .into_iter()
            .find(|p| p.id == project_id)
            .ok_or_else(|| AppError::not_found("Project not found"))
    }

    /// Returns the open Project, opening it on first use so every caller shares one instance.
    fn project(&self, project_id: Uuid) -> AppResult<Arc<Project>> {
        let mut open = self.open_projects.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(project) = open.get(&project_id) {
            return Ok(Arc::clone(project));
        }
        let summary = self.find_summary(project_id)?;
        let project = Arc::new(projects::open(&summary, self.settings().origin())?);
        open.insert(project_id, Arc::clone(&project));
        Ok(project)
    }
}

struct ChannelSink(Channel<Vec<Event>>);

impl EventSink for ChannelSink {
    fn send(&self, events: &[Event]) -> bool {
        self.0.send(events.to_vec()).is_ok()
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<ProjectSummary>> {
    projects::list(&state.data_root, &state.settings().recent_projects)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_project(state: State<'_, AppState>, name: String) -> AppResult<ProjectSummary> {
    projects::create(&state.data_root, &name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_project(state: State<'_, AppState>, project_id: Uuid) -> AppResult<ProjectSummary> {
    let summary = state.find_summary(project_id)?;
    state.project(project_id)?;
    let mut settings = state.settings.lock().unwrap_or_else(|p| p.into_inner());
    settings.recent_projects.insert(project_id, now_ms());
    settings.save(&state.config_dir)?;
    Ok(summary)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_conversations(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<Vec<ConversationSummary>> {
    conversations::list(&*state.project(project_id)?)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<ConversationSummary> {
    conversations::create(&*state.project(project_id)?)
}

/// The Conversation as stored, and a subscription that sends `on_events` every event
/// persisted after it.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
    on_events: Channel<Vec<Event>>,
) -> AppResult<OpenedConversation> {
    state
        .project(project_id)?
        .open(conversation_id, Box::new(ChannelSink(on_events)))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn unsubscribe_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
    subscription_id: Uuid,
) -> AppResult<()> {
    state.project(project_id)?.unsubscribe(subscription_id);
    Ok(())
}

/// Ends every Conversation subscription of every open Project. The UI calls it when it
/// starts, so subscriptions held for a view that was reloaded end.
#[tauri::command(rename_all = "snake_case")]
pub async fn reset_subscriptions(state: State<'_, AppState>) -> AppResult<()> {
    let open = state.open_projects.lock().unwrap_or_else(|p| p.into_inner());
    for project in open.values() {
        project.unsubscribe_all();
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn send_message(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
    input: SendMessageInput,
) -> AppResult<Message> {
    if state.sidecar.status().state != SidecarState::Ready {
        return Err(AppError::new(
            "sidecar_unavailable",
            "Mini-Me cannot answer yet. Wait until it is ready, then send your message.",
        ));
    }
    let project = state.project(project_id)?;
    let settings = state.settings();
    let route = RouteSettings {
        model: settings.ai.model(),
        threshold: settings.routing.threshold,
        timeout: ROUTE_TIMEOUT,
        // Jev's raw answers are a developer aid, kept only while Developer mode is on.
        show_answers: settings.routing.show_answers && state.developer_mode(),
    };
    state.routing.send(
        Arc::clone(&state.runs),
        route,
        project,
        conversation_id,
        input,
        settings.user_id,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_routing_threshold(state: State<'_, AppState>, threshold: f64) -> AppResult<()> {
    let mut settings = state.settings.lock().unwrap_or_else(|p| p.into_inner());
    settings.routing.set_threshold(threshold)?;
    settings.save(&state.config_dir)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_show_jev_answers(state: State<'_, AppState>, show: bool) -> AppResult<()> {
    let mut settings = state.settings.lock().unwrap_or_else(|p| p.into_inner());
    settings.routing.show_answers = show;
    settings.save(&state.config_dir)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_developer_mode(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.developer_mode())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_developer_mode(state: State<'_, AppState>, on: bool) -> AppResult<()> {
    let mut settings = state.settings.lock().unwrap_or_else(|p| p.into_inner());
    settings.developer_mode = Some(on);
    settings.save(&state.config_dir)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_home_settings(state: State<'_, AppState>) -> AppResult<HomeSettings> {
    Ok(state.settings().home)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_show_home_mini_mes(state: State<'_, AppState>, show: bool) -> AppResult<()> {
    let mut settings = state.settings.lock().unwrap_or_else(|p| p.into_inner());
    settings.home.show_mini_mes = show;
    settings.save(&state.config_dir)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_mini_mes(state: State<'_, AppState>) -> AppResult<Vec<MiniMeSummary>> {
    Ok(state.library.current().summaries())
}

/// Everything the Library view shows.
#[derive(serde::Serialize)]
pub struct LibraryView {
    mini_mes: Vec<MiniMeSummary>,
    traits: Vec<TraitSummary>,
    /// User-made entries left out because they break a rule.
    skipped: Vec<Skipped>,
    /// Why `user-library.json` could not be read; user-made definitions cannot be changed
    /// while it is set.
    unreadable: Option<String>,
}

fn library_view(store: &LibraryStore) -> LibraryView {
    let library = store.current();
    LibraryView {
        mini_mes: library.summaries(),
        traits: library.trait_summaries(),
        skipped: store.skipped(),
        unreadable: store.unreadable(),
    }
}

/// A saved definition's ID, with the library as it now is.
#[derive(serde::Serialize)]
pub struct Saved {
    id: Uuid,
    library: LibraryView,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_library(state: State<'_, AppState>) -> AppResult<LibraryView> {
    Ok(library_view(&state.library))
}

/// A Mini-Me with its Workflow, for its editor.
#[derive(serde::Serialize)]
pub struct MiniMeDetail {
    #[serde(flatten)]
    mini_me: MiniMe,
    built_in: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_mini_me(state: State<'_, AppState>, id: Uuid) -> AppResult<MiniMeDetail> {
    let library = state.library.current();
    let mini_me = library.mini_me(id).ok_or_else(|| AppError::not_found("Mini-Me not found"))?;
    Ok(MiniMeDetail { mini_me: mini_me.clone(), built_in: library.is_built_in(id) })
}

/// Creates (with a nil ID) or replaces a user-made Mini-Me.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_mini_me(state: State<'_, AppState>, mini_me: MiniMe) -> AppResult<Saved> {
    let id = state.library.save_mini_me(mini_me)?.id;
    Ok(Saved { id, library: library_view(&state.library) })
}

/// Creates (with a nil ID) or replaces a user-made Trait.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_trait(state: State<'_, AppState>, draft: TraitDraft) -> AppResult<Saved> {
    let id = state.library.save_trait(draft)?.id;
    Ok(Saved { id, library: library_view(&state.library) })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_mini_me(state: State<'_, AppState>, id: Uuid) -> AppResult<LibraryView> {
    state.library.delete_mini_me(id)?;
    Ok(library_view(&state.library))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_trait(state: State<'_, AppState>, id: Uuid) -> AppResult<LibraryView> {
    state.library.delete_trait(id)?;
    Ok(library_view(&state.library))
}

/// The AI settings and which providers have a saved key. Keys themselves never leave the
/// core.
#[derive(serde::Serialize)]
pub struct AiSettingsView {
    provider: String,
    model: String,
    saved_keys: Vec<String>,
    threshold: f64,
    show_answers: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_user_profile(state: State<'_, AppState>) -> AppResult<UserProfile> {
    Ok(state.profile.current())
}

/// Saves the user's name, or clears it when `name` is empty.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_user_name(state: State<'_, AppState>, name: String) -> AppResult<UserProfile> {
    state.profile.save_name(&name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_ai_settings(state: State<'_, AppState>) -> AppResult<AiSettingsView> {
    let settings = state.settings();
    Ok(AiSettingsView {
        provider: settings.ai.provider,
        model: settings.ai.model,
        saved_keys: KeychainSecrets::saved(),
        threshold: settings.routing.threshold,
        show_answers: settings.routing.show_answers,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_ai_model(
    state: State<'_, AppState>,
    provider: String,
    model: String,
) -> AppResult<()> {
    let ai = AiSettings::new(&provider, &model)?;
    let mut settings = state.settings.lock().unwrap_or_else(|p| p.into_inner());
    settings.ai = ai;
    settings.save(&state.config_dir)
}

/// Starts signing in to the Ai2 account and opens the page where the user confirms the code.
#[tauri::command(rename_all = "snake_case")]
pub async fn ai2_start_sign_in(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let ai2 = Arc::clone(&state.ai2);
    let page = tauri::async_runtime::spawn_blocking(move || ai2.start_sign_in())
        .await
        .map_err(|e| AppError::new("ai2_unavailable", e.to_string()))??;
    app.opener()
        .open_url(page, None::<&str>)
        .map_err(|e| AppError::new("open_failed", e.to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn subscribe_ai2_status(
    state: State<'_, AppState>,
    on_status: Channel<Ai2Status>,
) -> AppResult<()> {
    state
        .ai2
        .subscribe(Box::new(move |status| on_status.send(status.clone()).is_ok()));
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn ai2_sign_out(state: State<'_, AppState>) -> AppResult<()> {
    state.ai2.sign_out()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_api_key(
    state: State<'_, AppState>,
    provider: String,
    key: String,
) -> AppResult<()> {
    if provider == crate::ai2::AI2_ACCOUNT {
        return Err(AppError::invalid_input("The Ai2 account is managed by signing in and out."));
    }
    KeychainSecrets::save(&provider, &key)?;
    if provider == TYPESAFE {
        state.routing.key_saved(true);
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn remove_api_key(state: State<'_, AppState>, provider: String) -> AppResult<()> {
    if provider == crate::ai2::AI2_ACCOUNT {
        return Err(AppError::invalid_input("The Ai2 account is managed by signing in and out."));
    }
    KeychainSecrets::remove(&provider)?;
    if provider == TYPESAFE {
        state.routing.key_saved(false);
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_reply(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
) -> AppResult<()> {
    let stopped = conversations::stop_reply(&*state.project(project_id)?, conversation_id)?;
    for message_id in stopped {
        state.runs.cancel_message(message_id);
    }
    Ok(())
}

/// Answers the approval a paused reply waits for. Approving resumes its run; rejecting ends
/// the reply with the Workflow's output so far.
#[tauri::command(rename_all = "snake_case")]
pub async fn answer_approval(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
    component_id: Uuid,
    approved: bool,
) -> AppResult<()> {
    let project = state.project(project_id)?;
    // Checked first so the answer is not recorded when the run could not resume.
    conversations::paused_run(&project, message_id, component_id)?;
    if approved && state.sidecar.status().state != SidecarState::Ready {
        return Err(AppError::new(
            "sidecar_unavailable",
            "Mini-Me cannot continue yet. Wait until it is ready, then approve again.",
        ));
    }
    let paused = conversations::answer_approval(&project, message_id, component_id, approved)?;
    if approved {
        let conversation_id = project
            .lock()
            .message_place(message_id)?
            .map(|(conversation, _)| conversation)
            .ok_or_else(|| AppError::not_found("Message not found"))?;
        state.runs.resume(project, conversation_id, paused, state.settings().ai.model());
    }
    Ok(())
}

/// Every reply paused at an approval, across all Projects, newest first.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_paused_approvals(state: State<'_, AppState>) -> AppResult<Vec<PausedApproval>> {
    approvals::list(&state.data_root)
}

/// The most recently active Conversations across all Projects, newest first.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_recent_conversations(
    state: State<'_, AppState>,
) -> AppResult<Vec<RecentConversation>> {
    recent::list(&state.data_root)
}

/// Sends the running replies now and the whole list again each time it changes.
#[tauri::command(rename_all = "snake_case")]
pub async fn subscribe_running_replies(
    state: State<'_, AppState>,
    on_change: Channel<Vec<RunningReply>>,
) -> AppResult<()> {
    state
        .runs
        .subscribe(Box::new(move |running| on_change.send(running.to_vec()).is_ok()));
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn subscribe_sidecar_status(
    state: State<'_, AppState>,
    on_status: Channel<SidecarStatus>,
) -> AppResult<()> {
    state
        .sidecar
        .subscribe(Box::new(move |status| on_status.send(status.clone()).is_ok()));
    Ok(())
}

/// Sends why Mini-Mes are not chosen automatically, or `None` while Jev chooses them, now and
/// on every change.
#[tauri::command(rename_all = "snake_case")]
pub async fn subscribe_routing_warning(
    state: State<'_, AppState>,
    on_warning: Channel<Option<String>>,
) -> AppResult<()> {
    state
        .routing
        .subscribe(Box::new(move |warning| on_warning.send(warning.map(str::to_string)).is_ok()));
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn restart_sidecar(state: State<'_, AppState>) -> AppResult<()> {
    state.sidecar.restart();
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn subscribe_update_status(
    state: State<'_, AppState>,
    on_status: Channel<UpdateStatus>,
) -> AppResult<()> {
    state
        .updates
        .subscribe(Box::new(move |status| on_status.send(status.clone()).is_ok()));
    Ok(())
}

/// Stops the sidecar, installs the downloaded update and restarts. If the install fails the
/// app still restarts, on the version it was running.
#[tauri::command(rename_all = "snake_case")]
pub async fn restart_to_update(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.sidecar.shutdown();
    state.updates.install_pending();
    app.restart()
}

/// Opens the native file picker and imports every picked file. Paths come only from the
/// dialog, never from the UI, which keeps imports the single exception to confinement.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_assets(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<Vec<AssetRef>> {
    let project = state.project(project_id)?;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().blocking_pick_files()
    })
    .await
    .map_err(|e| AppError::storage(e.to_string()))?
    .unwrap_or_default();

    let mut imported = Vec::new();
    for file in picked {
        let path = file
            .into_path()
            .map_err(|e| AppError::invalid_input(e.to_string()))?;
        imported.push(assets::import(&project, &path, &state.user())?);
    }
    Ok(imported)
}

/// Imports an image pasted into the composer. The bytes are the raw request body; the
/// headers carry `project-id`, `media-type` and the clipboard's percent-encoded `name`.
#[tauri::command]
pub async fn import_pasted_image(
    state: State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<AssetRef> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::invalid_input("A pasted image is sent as raw bytes."));
    };
    let header = |name: &str| {
        request.headers().get(name).and_then(|value| value.to_str().ok()).unwrap_or_default()
    };
    let project_id = Uuid::parse_str(header("project-id"))
        .map_err(|_| AppError::invalid_input("A pasted image needs its Project."))?;
    let name = percent_encoding::percent_decode_str(header("name")).decode_utf8_lossy();
    let media_type = header("media-type");
    let project = state.project(project_id)?;
    let name = assets::pasted_name(&name, media_type);
    assets::import_bytes(&project, &name, media_type, bytes, &state.user())
}

/// Imports files dropped on the window; only paths of the latest drop are accepted.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_dropped(
    state: State<'_, AppState>,
    project_id: Uuid,
    paths: Vec<PathBuf>,
) -> AppResult<Vec<AssetRef>> {
    let dropped = state.dropped.lock().unwrap_or_else(|p| p.into_inner()).clone();
    assets::import_dropped(&*state.project(project_id)?, &paths, &dropped, &state.user())
}

/// The bytes of an image Asset, for its thumbnail in the composer.
#[tauri::command(rename_all = "snake_case")]
pub async fn read_image_asset(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<tauri::ipc::Response> {
    let (_, bytes) = assets::read_image(&*state.project(project_id)?, asset_id)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_assets(
    state: State<'_, AppState>,
    project_id: Uuid,
    query: Option<String>,
) -> AppResult<Vec<AssetRef>> {
    assets::list(&*state.project(project_id)?, query.as_deref())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_project_files(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<Vec<assets::FileEntry>> {
    assets::project_files(&*state.project(project_id)?)
}

/// The Project Overview: its header, summary, featured component and outputs.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_overview(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<overview::Overview> {
    overview::overview(&*state.project(project_id)?)
}

/// Features a chart or table on the Overview, or clears the featured component with `null`.
#[tauri::command(rename_all = "snake_case")]
pub async fn feature_component(
    state: State<'_, AppState>,
    project_id: Uuid,
    component_id: Option<Uuid>,
) -> AppResult<()> {
    overview::feature(&*state.project(project_id)?, component_id)
}

/// Asks the model chosen in Settings to summarise the Project's Conversations and saves the
/// summary. On any failure the previous summary stays. Returns the updated Overview.
#[tauri::command(rename_all = "snake_case")]
pub async fn update_overview_summary(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<overview::Overview> {
    let project = state.project(project_id)?;
    let model = state
        .settings()
        .ai
        .model()
        .ok_or_else(|| AppError::new("model_not_set", "Choose an AI model in Settings first."))?;
    let material =
        overview::summary_material(&project, &state.library.current(), SUMMARY_BUDGET_CHARS)?;
    if material.is_empty() {
        return Err(AppError::invalid_input("There are no messages to summarise yet."));
    }
    let runs = Arc::clone(&state.runs);
    let text = tauri::async_runtime::spawn_blocking(move || {
        runs.summarize(model, material, SUMMARY_TIMEOUT)
    })
    .await
    .map_err(|e| AppError::new("summary_failed", e.to_string()))??;
    overview::save_summary(&project, &text, now_ms())?;
    overview::overview(&project)
}

/// Creates an empty document titled `title`, with the user's name as author when they have one.
#[tauri::command(rename_all = "snake_case")]
pub async fn create_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    title: String,
) -> AppResult<AssetRef> {
    let author = state.profile.current().name;
    documents::create(&*state.project(project_id)?, &title, author.as_deref(), &state.user())
}

/// Drafts the document `asset_id`, just created, from the Conversation `conversation_id`,
/// sending each piece of text to `on_event` as it arrives. Whatever was written is saved after
/// the document's header when the draft ends, fails or is stopped with `stop_draft`.
#[tauri::command(rename_all = "snake_case")]
pub async fn draft_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
    conversation_id: Uuid,
    draft_id: Uuid,
    on_event: Channel<DraftEvent>,
) -> AppResult<()> {
    let model = state
        .settings()
        .ai
        .model()
        .ok_or_else(|| AppError::new("model_not_set", "Choose an AI model in Settings first."))?;
    let project = state.project(project_id)?;
    let title = conversations::title(&project, conversation_id)?;
    let material = overview::conversation_material(
        &project,
        &state.library.current(),
        conversation_id,
        HISTORY_BUDGET_CHARS,
    )?;
    if material.is_empty() {
        return Err(AppError::invalid_input("There are no messages to draft from yet."));
    }
    let header = documents::read(&project, asset_id)?;
    let runs = Arc::clone(&state.runs);
    let (body, ending) = tauri::async_runtime::spawn_blocking(move || {
        runs.draft(draft_id, model, title, material, DRAFT_IDLE, |event| {
            let _ = on_event.send(event.clone());
        })
    })
    .await
    .map_err(|e| AppError::new("draft_failed", e.to_string()))?;
    documents::save_draft(&project, asset_id, &header, &body)?;
    ending.map_or(Ok(()), Err)
}

/// Stops the draft `draft_id`; `draft_document` then saves what was written.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_draft(state: State<'_, AppState>, draft_id: Uuid) -> AppResult<()> {
    state.runs.cancel_draft(draft_id);
    Ok(())
}

/// The document text `source` as it would export, one SVG image per page.
#[tauri::command(rename_all = "snake_case")]
pub async fn preview_document(state: State<'_, AppState>, source: String) -> AppResult<Vec<String>> {
    let runs = Arc::clone(&state.runs);
    tauri::async_runtime::spawn_blocking(move || runs.preview(source, EXPORT_TIMEOUT))
        .await
        .map_err(|e| AppError::new("preview_failed", e.to_string()))?
}

/// Exports the document `asset_id` as a PDF Asset named after it, and returns that Asset.
#[tauri::command(rename_all = "snake_case")]
pub async fn export_document_pdf(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<AssetRef> {
    let project = state.project(project_id)?;
    let name = assets::find(&project.lock(), asset_id)?.name;
    let source = documents::read(&project, asset_id)?;
    let runs = Arc::clone(&state.runs);
    let export_name = name.clone();
    let pdf = tauri::async_runtime::spawn_blocking(move || {
        runs.export_pdf(export_name, source, EXPORT_TIMEOUT)
    })
    .await
    .map_err(|e| AppError::new("export_failed", e.to_string()))??;
    documents::store_pdf(&project, asset_id, &name, &pdf, &state.user())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn read_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<documents::OpenedDocument> {
    documents::open(&*state.project(project_id)?, asset_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
    text: String,
    anchors: Vec<comments::Anchor>,
) -> AppResult<()> {
    documents::save(&*state.project(project_id)?, asset_id, &text, &anchors)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_asset(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<()> {
    let path = assets::file_path(&*state.project(project_id)?, asset_id)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::new("open_failed", e.to_string()))
}

/// Starts a comment thread on the passage `start..end` of the document `asset_id`, which reads
/// `quote`. Its comments are sent with `send_message` on its `conversation_id`.
#[tauri::command(rename_all = "snake_case")]
pub async fn create_thread(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
    start: u32,
    end: u32,
    quote: String,
) -> AppResult<comments::CommentThread> {
    comments::create(&*state.project(project_id)?, asset_id, (start, end), &quote)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_threads(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<Vec<comments::CommentThread>> {
    comments::list(&*state.project(project_id)?, asset_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_thread_resolved(
    state: State<'_, AppState>,
    project_id: Uuid,
    thread_id: Uuid,
    resolved: bool,
) -> AppResult<()> {
    comments::set_resolved(&*state.project(project_id)?, thread_id, resolved)
}

/// Stops the thread's running reply, if any, then deletes the thread.
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_thread(
    state: State<'_, AppState>,
    project_id: Uuid,
    thread_id: Uuid,
) -> AppResult<()> {
    let project = state.project(project_id)?;
    for message_id in conversations::stop_reply(&project, thread_id)? {
        state.runs.cancel_message(message_id);
    }
    comments::delete(&project, thread_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn accept_suggestion(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
    component_id: Uuid,
) -> AppResult<comments::Accepted> {
    comments::accept_suggestion(&*state.project(project_id)?, message_id, component_id)
}

/// Rejects or dismisses a suggestion, leaving the document as it is.
#[tauri::command(rename_all = "snake_case")]
pub async fn answer_suggestion(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
    component_id: Uuid,
    decision: comments::Decision,
) -> AppResult<()> {
    let project = state.project(project_id)?;
    comments::answer_suggestion(&project, message_id, component_id, decision)
}
