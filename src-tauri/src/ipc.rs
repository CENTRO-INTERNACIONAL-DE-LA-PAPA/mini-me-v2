//! Tauri commands and the per-Conversation event channel.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::ai2::{Ai2, Ai2Status, AppSecrets};
use crate::approvals::{self, PausedApproval};
use crate::assets::{self, AssetOrigin};
use crate::comments;
use crate::conversations::{self, ConversationSummary, SendMessageInput};
use crate::dataverse::{self, Dataset, DataverseFile, Search, SearchPage};
use crate::documents;
use crate::error::{AppError, AppResult};
use crate::features::{self, FEATURES, FeatureFlag};
use crate::projects::{self, ProjectSummary};
use crate::project_activity::{self, ProjectActivity};
use crate::recent::{self, RecentConversation};
use crate::protocol::{
    AssetRef, Author, AuthorKind, Event, Message, MessageStatus, OpenedConversation, new_id,
    now_ms,
};
use crate::history::HISTORY_BUDGET_CHARS;
use crate::library::{MiniMe, MiniMeSummary, TraitSummary};
use crate::user_library::{LibraryStore, Skipped, TraitDraft};
use crate::user_profile::{ProfileStore, UserProfile};
use crate::overview;
use crate::quarto;
use crate::routing::{REACTION_CHANCE, ROUTE_TIMEOUT, RouteSettings, Routing};
use crate::runs::{self, CANCEL_TIMEOUT, DraftEvent, RunningReply, Runs};
use crate::secrets::{self, KeychainSecrets};
use crate::settings::{AiSettings, DebugSettings, HomeSettings, Settings};
use crate::link::SummaryKind;
use crate::sidecar::{LOG_FILE, Launch, SidecarLog, SidecarState, SidecarStatus, Supervisor, Timing};
use crate::store::{EventSink, Project};
use crate::sync::locked;
use crate::updates::{UpdateStatus, Updates};

/// Whole Conversations, newest first, up to four times one call's history.
const SUMMARY_BUDGET_CHARS: usize = HISTORY_BUDGET_CHARS * 4;

/// How long a summary may take; long material can keep the model writing for a while.
const SUMMARY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);

/// How long naming a Conversation may take; its title is a few words.
const TITLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const MODEL_TEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// How long a draft may go without new text before it is stopped.
const DRAFT_IDLE: std::time::Duration = std::time::Duration::from_secs(90);

/// The key account Jev's routing uses.
const TYPESAFE: &str = "typesafe";

pub struct AppState {
    config_dir: PathBuf,
    /// Mini-Me Canary has Developer mode on until the user turns it off.
    is_canary: bool,
    /// From the Tauri configuration.
    app_version: String,
    data_root: PathBuf,
    settings: Mutex<Settings>,
    /// The last Quarto lookup, shared with the check that gates a running Mini-Me's document tools.
    quarto: Arc<quarto::Known>,
    open_projects: Mutex<HashMap<Uuid, Arc<Project>>>,
    runs: Arc<Runs>,
    routing: Arc<Routing>,
    library: Arc<LibraryStore>,
    profile: ProfileStore,
    pub sidecar: Arc<Supervisor>,
    pub updates: Arc<Updates>,
    ai2: Arc<Ai2>,
    /// The latest drop's paths, as the operating system reported them.
    dropped: Mutex<Vec<PathBuf>>,
}

impl AppState {
    pub fn init(app: &AppHandle) -> AppResult<Self> {
        // Separates Mini-Me from Mini-Me Canary: settings, logs, Projects folder and keychain.
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
        let profile = ProfileStore::open(&config_dir);
        let ai2 = Ai2::system();
        let app_version = app.package_info().version.to_string();
        log.line(&format!("start: Mini-Me {app_version}"));
        let settings = Settings::load_or_create(&config_dir, &app_version)?;
        let quarto = Arc::new(quarto::Known::new(settings.quarto_path.clone()));
        // Looked up now, in the background, so a document does not wait for it.
        let warm = Arc::clone(&quarto);
        std::thread::spawn(move || {
            warm.status();
        });
        let is_canary = projects::is_canary(&identifier);
        let runs = Arc::new(Runs::new(
            Box::new(AppSecrets {
                ai2: Arc::clone(&ai2),
            }),
            Arc::clone(&log),
            CANCEL_TIMEOUT,
            Arc::clone(&library),
        ));
        let gate = Arc::clone(&quarto);
        runs.set_document_gate(Arc::new(move || gate.require().map(|_| ())));
        runs.set_active_features(active_feature_ids(&settings, is_canary));
        runs.set_debug(settings.reply_debug(is_canary));
        let sidecar = Supervisor::new(
            launch,
            Timing::for_build(),
            Arc::clone(&runs),
            Arc::clone(&log),
        );
        sidecar.spawn();
        let updates = Updates::new(log);
        // Mini-Me Canary has no update feed of its own, and must never install Mini-Me's.
        if !cfg!(debug_assertions) && !projects::is_canary(&identifier) {
            updates.spawn(app.clone());
        }
        Ok(Self {
            is_canary,
            app_version,
            settings: Mutex::new(settings),
            quarto,
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

    /// Replaces the previous drop's paths.
    pub fn record_drop(&self, paths: Vec<PathBuf>) {
        *locked(&self.dropped) = paths;
    }

    /// Whether developer options and the web inspector are available.
    pub fn developer_mode(&self) -> bool {
        self.settings().developer_mode(self.is_canary)
    }

    /// Saves the flags, then tells running Traits which are on.
    fn change_features(&self, change: impl FnOnce(&mut Settings)) -> AppResult<()> {
        let settings = self.updated_settings(change)?;
        self.runs.set_active_features(active_feature_ids(&settings, self.is_canary));
        Ok(())
    }

    /// A failed save keeps the change in memory.
    fn update_settings(&self, change: impl FnOnce(&mut Settings)) -> AppResult<()> {
        self.updated_settings(change).map(drop)
    }

    /// Like `update_settings`, but returns the settings still locked.
    fn updated_settings(
        &self,
        change: impl FnOnce(&mut Settings),
    ) -> AppResult<MutexGuard<'_, Settings>> {
        let mut settings = locked(&self.settings);
        change(&mut settings);
        settings.save(&self.config_dir)?;
        Ok(settings)
    }

    fn stop_replies(&self, project: &Project, conversation_id: Uuid) -> AppResult<()> {
        for message_id in conversations::stop_reply(project, conversation_id)? {
            self.runs.cancel_message(message_id);
        }
        Ok(())
    }

    fn settings(&self) -> Settings {
        locked(&self.settings).clone()
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

    /// Opens it on first use so every caller shares one instance.
    fn project(&self, project_id: Uuid) -> AppResult<Arc<Project>> {
        let mut open = locked(&self.open_projects);
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
    state.update_settings(|settings| {
        settings.recent_projects.insert(project_id, now_ms());
    })?;
    Ok(summary)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_conversations(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<Vec<ConversationSummary>> {
    let mut list = conversations::list(&*state.project(project_id)?)?;
    let running = state.runs.running();
    for conversation in list.iter_mut().filter(|c| c.status.is_none()) {
        conversation.status = runs::running_status(&running, project_id, conversation.id);
    }
    Ok(list)
}

/// `None`, changing nothing, when already titled, no model is set or the model fails, so a missing
/// key never fails anything.
#[tauri::command(rename_all = "snake_case")]
pub async fn name_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
) -> AppResult<Option<String>> {
    let project = state.project(project_id)?;
    let Some(material) = conversations::first_message_to_name(&project, conversation_id)? else {
        return Ok(None);
    };
    let Some(model) = state.settings().ai.model() else {
        return Ok(None);
    };
    let runs = Arc::clone(&state.runs);
    let written = blocking("title_failed", move || {
        runs.summarize(model, material, SummaryKind::Title, TITLE_TIMEOUT)
    })
    .await?;
    let Ok(title) = written else {
        return Ok(None);
    };
    let named = conversations::set_title_if_default(&project, conversation_id, &title)?;
    Ok(named.then(|| title.trim().to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn rename_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
    title: String,
) -> AppResult<()> {
    conversations::rename(&*state.project(project_id)?, conversation_id, &title)
}

/// Stops its running reply first.
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
) -> AppResult<()> {
    let project = state.project(project_id)?;
    state.stop_replies(&project, conversation_id)?;
    conversations::delete(&project, conversation_id)
}

/// Only the name changes, never the folder.
#[tauri::command(rename_all = "snake_case")]
pub async fn rename_project(
    state: State<'_, AppState>,
    project_id: Uuid,
    name: String,
) -> AppResult<ProjectSummary> {
    let summary = state.find_summary(project_id)?;
    // Through the open Project, so running replies and every other holder share one instance.
    let name = state.project(project_id)?.rename(&name)?;
    Ok(ProjectSummary { name, ..summary })
}

/// How long a delete waits for stopped replies to release the Project: cancel timeout plus margin.
const RELEASE_WAIT: Duration = Duration::from_secs(CANCEL_TIMEOUT.as_secs() + 3);

/// Deletes the folder too, after stopping every running reply.
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_project(state: State<'_, AppState>, project_id: Uuid) -> AppResult<()> {
    let summary = state.find_summary(project_id)?;
    let project = state.project(project_id)?;
    for conversation in conversations::list(&project)? {
        state.stop_replies(&project, conversation.id)?;
    }
    locked(&state.open_projects).remove(&project_id);
    // A stopped run holds the database until it ends; removing the folder sooner fails on Windows.
    let (project, released) = blocking("storage", move || {
        let released = projects::wait_until_alone(&project, RELEASE_WAIT);
        (project, released)
    })
    .await?;
    if !released {
        locked(&state.open_projects).insert(project_id, project);
        return Err(AppError::storage(
            "The Project is still stopping its replies, so it was not deleted. Try again in a moment.",
        ));
    }
    drop(project);
    projects::delete(&summary.folder)?;
    state.update_settings(|settings| {
        settings.recent_projects.remove(&project_id);
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<ConversationSummary> {
    conversations::create(&*state.project(project_id)?)
}

/// The stored Conversation, then every later event to `on_events`.
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

/// Called when the UI starts, so subscriptions of a reloaded view end.
#[tauri::command(rename_all = "snake_case")]
pub async fn reset_subscriptions(state: State<'_, AppState>) -> AppResult<()> {
    let open = locked(&state.open_projects);
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
        // Jev's debug record is a developer aid, kept only while Developer mode is on.
        show_answers: settings.routing.show_answers && state.developer_mode(),
        show_asked: settings.routing.show_asked && state.developer_mode(),
        reaction_chance: REACTION_CHANCE,
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
    let mut settings = locked(&state.settings);
    settings.routing.set_threshold(threshold)?;
    settings.save(&state.config_dir)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_show_jev_answers(state: State<'_, AppState>, show: bool) -> AppResult<()> {
    state.update_settings(|settings| settings.routing.show_answers = show)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_show_jev_asked(state: State<'_, AppState>, show: bool) -> AppResult<()> {
    state.update_settings(|settings| settings.routing.show_asked = show)
}

/// True once per new app version, never in Mini-Me Canary.
#[tauri::command(rename_all = "snake_case")]
pub async fn take_whats_new(state: State<'_, AppState>) -> AppResult<bool> {
    let mut settings = locked(&state.settings);
    if !settings.take_whats_new(&state.app_version, state.is_canary) {
        return Ok(false);
    }
    settings.save(&state.config_dir)?;
    Ok(true)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_developer_mode(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.developer_mode())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_developer_mode(state: State<'_, AppState>, on: bool) -> AppResult<()> {
    let settings = state.updated_settings(|settings| settings.developer_mode = Some(on))?;
    state.runs.set_debug(settings.reply_debug(state.is_canary));
    Ok(())
}

/// Applies to runs started from now on.
#[tauri::command(rename_all = "snake_case")]
pub async fn set_reply_debug(state: State<'_, AppState>, debug: DebugSettings) -> AppResult<()> {
    let settings = state.updated_settings(|settings| settings.debug = debug)?;
    state.runs.set_debug(settings.reply_debug(state.is_canary));
    Ok(())
}

fn active_feature_ids(settings: &Settings, is_canary: bool) -> Vec<String> {
    let active = settings.active_features(is_canary);
    active.iter().map(|feature| feature.id.to_string()).collect()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_feature_flags(state: State<'_, AppState>) -> AppResult<Vec<FeatureFlag>> {
    let active = state.settings().active_features(state.is_canary);
    Ok(active.into_iter().map(FeatureFlag::from).collect())
}

/// Fails with `wrong_key` when `key` belongs to no flag.
#[tauri::command(rename_all = "snake_case")]
pub async fn unlock_feature_flag(state: State<'_, AppState>, key: String) -> AppResult<FeatureFlag> {
    let feature = features::matching(FEATURES, &key)
        .ok_or_else(|| AppError::new("wrong_key", "This key doesn't match any feature flag."))?;
    state.change_features(|settings| settings.unlock_feature(feature.id))?;
    Ok(FeatureFlag::from(feature))
}

/// Only its key turns it on again.
#[tauri::command(rename_all = "snake_case")]
pub async fn lock_feature_flag(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.change_features(|settings| settings.lock_feature(&id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_home_settings(state: State<'_, AppState>) -> AppResult<HomeSettings> {
    Ok(state.settings().home)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_show_home_mini_mes(state: State<'_, AppState>, show: bool) -> AppResult<()> {
    state.update_settings(|settings| settings.home.show_mini_mes = show)
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
    /// Why `library.json` could not be read; user-made definitions are read-only while set.
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

/// A nil ID creates; any other replaces.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_mini_me(state: State<'_, AppState>, mini_me: MiniMe) -> AppResult<Saved> {
    let id = state.library.save_mini_me(mini_me)?.id;
    Ok(Saved { id, library: library_view(&state.library) })
}

/// A nil ID creates; any other replaces.
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

/// Keys themselves never leave the core.
#[derive(serde::Serialize)]
pub struct AiSettingsView {
    provider: String,
    model: String,
    saved_keys: Vec<String>,
    threshold: f64,
    show_answers: bool,
    show_asked: bool,
    debug: DebugSettings,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_user_profile(state: State<'_, AppState>) -> AppResult<UserProfile> {
    Ok(state.profile.current())
}

/// An empty `name` clears it.
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
        show_asked: settings.routing.show_asked,
        debug: settings.debug,
    })
}

/// One small request needing a tool call, which Mini-Mes depend on; fails with why it did not pass.
#[tauri::command(rename_all = "snake_case")]
pub async fn test_model(
    state: State<'_, AppState>,
    provider: String,
    model: String,
) -> AppResult<()> {
    let model = AiSettings::new(&provider, &model)?
        .model()
        .ok_or_else(|| AppError::invalid_input("Type a model ID first."))?;
    let runs = Arc::clone(&state.runs);
    blocking("summary_failed", move || {
        runs.summarize(model, String::new(), SummaryKind::Test, MODEL_TEST_TIMEOUT)
    })
    .await??;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_ai_model(
    state: State<'_, AppState>,
    provider: String,
    model: String,
) -> AppResult<()> {
    let ai = AiSettings::new(&provider, &model)?;
    state.update_settings(|settings| settings.ai = ai)
}

/// Opens the page where the user confirms the code.
#[tauri::command(rename_all = "snake_case")]
pub async fn ai2_start_sign_in(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let ai2 = Arc::clone(&state.ai2);
    let page = blocking("ai2_unavailable", move || ai2.start_sign_in()).await??;
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
    state.stop_replies(&*state.project(project_id)?, conversation_id)
}

/// Approving resumes the run; rejecting ends the reply with the output so far.
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

/// Across all Projects, newest first.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_paused_approvals(state: State<'_, AppState>) -> AppResult<Vec<PausedApproval>> {
    approvals::list(&state.data_root)
}

/// `None` once the message is gone; a final status is stored before the reply stops running.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_message_status(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
) -> AppResult<Option<MessageStatus>> {
    let project = state.project(project_id)?;
    let place = project.lock().message_place(message_id)?;
    Ok(place.map(|(_, status)| status))
}

/// Across all Projects, newest first.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_recent_conversations(
    state: State<'_, AppState>,
) -> AppResult<Vec<RecentConversation>> {
    let mut list = recent::list(&state.data_root)?;
    let running = state.runs.running();
    for conversation in list.iter_mut().filter(|c| c.status.is_none()) {
        conversation.status =
            runs::running_status(&running, conversation.project_id, conversation.conversation_id);
    }
    Ok(list)
}

/// What Home's Project cards show beyond each Project's name.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_project_activity(state: State<'_, AppState>) -> AppResult<Vec<ProjectActivity>> {
    project_activity::list(&state.data_root)
}

/// Sends the whole list now and on every change.
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

/// `None` while Jev chooses; sent now and on every change.
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

/// Stops the sidecar first; a failed install still restarts, on the old version.
#[tauri::command(rename_all = "snake_case")]
pub async fn restart_to_update(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.sidecar.shutdown();
    state.updates.install_pending();
    app.restart()
}

/// A page of CIP Dataverse's datasets matching `search`.
#[tauri::command(rename_all = "snake_case")]
pub async fn dataverse_search(search: Search) -> AppResult<SearchPage> {
    dataverse::search(&search)
}

/// A file of a CIP Dataverse dataset, with the Asset it already is in the Project, if any.
#[derive(Debug, Serialize)]
pub struct DatasetFile {
    #[serde(flatten)]
    pub file: DataverseFile,
    pub asset: Option<AssetRef>,
}

/// Marks the files already in the Project.
#[tauri::command(rename_all = "snake_case")]
pub async fn dataverse_files(
    state: State<'_, AppState>,
    project_id: Uuid,
    dataset_id: String,
) -> AppResult<Vec<DatasetFile>> {
    let project = state.project(project_id)?;
    let files = dataverse::files(&dataset_id)?;
    let mut in_project = assets::dataverse_files(&project.lock())?;
    Ok(files
        .into_iter()
        .map(|file| DatasetFile { asset: in_project.remove(&file.id), file })
        .collect())
}

#[derive(Debug, Deserialize)]
pub struct FileToDownload {
    pub id: u64,
    pub name: String,
}

/// What became of one file of a download: the Asset it is now, or why it failed.
#[derive(Debug, Serialize)]
pub struct Downloaded {
    pub file_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<AssetRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// One at a time; a file that fails leaves the others downloaded.
#[tauri::command(rename_all = "snake_case")]
pub async fn dataverse_download(
    state: State<'_, AppState>,
    project_id: Uuid,
    dataset: Dataset,
    files: Vec<FileToDownload>,
) -> AppResult<Vec<Downloaded>> {
    let project = state.project(project_id)?;
    let user = state.user();
    let mut results = Vec::new();
    for file in files {
        let origin = AssetOrigin::Dataverse {
            file_id: file.id,
            dataset_id: dataset.id.clone(),
            title: dataset.title.clone(),
            url: dataset.url.clone(),
        };
        // Downloaded outside the Project first, so a failed download leaves nothing in it.
        let temporary = std::env::temp_dir().join(format!("mini-me-dataverse-{}", new_id()));
        let stored = dataverse::download(file.id, &temporary).and_then(|()| {
            assets::import_downloaded(&project, &temporary, &file.name, &user, &origin)
        });
        let _ = std::fs::remove_file(&temporary);
        results.push(match stored {
            Ok(asset) => Downloaded { file_id: file.id, asset: Some(asset), error: None },
            Err(error) => Downloaded { file_id: file.id, asset: None, error: Some(error.message) },
        });
    }
    Ok(results)
}

/// Paths come only from the native dialog, never the UI: the single exception to confinement.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_assets(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: Uuid,
) -> AppResult<Vec<AssetRef>> {
    let project = state.project(project_id)?;
    let picked = blocking("storage", move || {
        app.dialog().file().blocking_pick_files()
    })
    .await?
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

/// Raw body bytes; headers carry `project-id`, `media-type` and a percent-encoded `name`.
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

/// Only paths of the latest drop are accepted.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_dropped(
    state: State<'_, AppState>,
    project_id: Uuid,
    paths: Vec<PathBuf>,
) -> AppResult<Vec<AssetRef>> {
    let dropped = locked(&state.dropped).clone();
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

/// On any failure the previous summary stays; returns the updated Overview.
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
    let text = blocking("summary_failed", move || {
        runs.summarize(model, material, SummaryKind::Overview, SUMMARY_TIMEOUT)
    })
    .await??;
    overview::save_summary(&project, &text, now_ms())?;
    overview::overview(&project)
}

/// Runs `work` on a blocking thread; fails with `code` if it panics.
async fn blocking<T: Send + 'static>(
    code: &'static str,
    work: impl FnOnce() -> T + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::new(code, e.to_string()))
}

/// From the last lookup; the error says why document work is blocked.
async fn require_quarto(state: &AppState) -> AppResult<PathBuf> {
    let known = Arc::clone(&state.quarto);
    blocking("quarto_failed", move || known.require()).await?
}

/// Looks Quarto up again when a render could not start it, so the notice shows; returns `result`.
fn looked_again<T>(known: &quarto::Known, result: AppResult<T>) -> AppResult<T> {
    if result.as_ref().is_err_and(|e| e.code == quarto::NOT_STARTED) {
        known.refresh();
    }
    result
}

/// As of the last lookup: at start, on request, and when its location changes.
#[tauri::command(rename_all = "snake_case")]
pub async fn quarto_status(state: State<'_, AppState>) -> AppResult<quarto::Status> {
    let known = Arc::clone(&state.quarto);
    blocking("quarto_failed", move || known.status()).await
}

/// For a Quarto installed after the app started.
#[tauri::command(rename_all = "snake_case")]
pub async fn recheck_quarto(state: State<'_, AppState>) -> AppResult<quarto::Status> {
    let known = Arc::clone(&state.quarto);
    blocking("quarto_failed", move || known.refresh()).await
}

/// `None` or an empty path clears it so the app looks again; returns the new status.
#[tauri::command(rename_all = "snake_case")]
pub async fn set_quarto_path(
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<quarto::Status> {
    let chosen = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    {
        // Saved before it takes effect, so a failed save leaves the old location in use.
        let mut settings = locked(&state.settings);
        let mut updated = settings.clone();
        updated.quarto_path = chosen.clone();
        updated.save(&state.config_dir)?;
        *settings = updated;
    }
    let known = Arc::clone(&state.quarto);
    blocking("quarto_failed", move || known.set_setting(chosen)).await
}

/// The user's name, if set, is the author.
#[tauri::command(rename_all = "snake_case")]
pub async fn create_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    title: String,
) -> AppResult<AssetRef> {
    require_quarto(&state).await?;
    let author = state.profile.current().name;
    documents::create(&*state.project(project_id)?, &title, author.as_deref(), &state.user())
}

/// Streams text to `on_event`; what was written is saved after the header however the draft ends.
#[tauri::command(rename_all = "snake_case")]
pub async fn draft_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
    conversation_id: Uuid,
    draft_id: Uuid,
    on_event: Channel<DraftEvent>,
) -> AppResult<()> {
    require_quarto(&state).await?;
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
    let (body, ending) = blocking("draft_failed", move || {
        runs.draft(draft_id, model, title, material, DRAFT_IDLE, |event| {
            let _ = on_event.send(event.clone());
        })
    })
    .await?;
    documents::save_draft(&project, asset_id, &header, &body)?;
    ending.map_or(Ok(()), Err)
}

/// Stops the draft `draft_id`; `draft_document` then saves what was written.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_draft(state: State<'_, AppState>, draft_id: Uuid) -> AppResult<()> {
    state.runs.cancel_draft(draft_id);
    Ok(())
}

/// One SVG per page; Project files the text names are available to the render.
#[tauri::command(rename_all = "snake_case")]
pub async fn preview_document(
    state: State<'_, AppState>,
    project_id: Uuid,
    source: String,
) -> AppResult<Vec<String>> {
    let program = require_quarto(&state).await?;
    let project = state.project(project_id)?;
    let known = Arc::clone(&state.quarto);
    blocking("preview_failed", move || {
        looked_again(&known, quarto::preview_pages(&project, &program, &source))
    })
    .await?
}

/// A new PDF Asset named after the document.
#[tauri::command(rename_all = "snake_case")]
pub async fn export_document_pdf(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<AssetRef> {
    let program = require_quarto(&state).await?;
    let project = state.project(project_id)?;
    let name = assets::find(&project.lock(), asset_id)?.name;
    let source = documents::read(&project, asset_id)?;
    let rendered = Arc::clone(&project);
    let known = Arc::clone(&state.quarto);
    let pdf = blocking("export_failed", move || {
        looked_again(&known, quarto::export_pdf(&rendered, &program, &source))
    })
    .await??;
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

/// Keeps the extension.
#[tauri::command(rename_all = "snake_case")]
pub async fn rename_asset(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
    name: String,
) -> AppResult<AssetRef> {
    assets::rename(&*state.project(project_id)?, asset_id, &name)
}

/// Adds a copy of the file `asset_id` named "<name> copy".
#[tauri::command(rename_all = "snake_case")]
pub async fn duplicate_asset(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<AssetRef> {
    assets::duplicate(&*state.project(project_id)?, asset_id, &state.user())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_asset(
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<()> {
    assets::delete(&*state.project(project_id)?, asset_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn clear_debug_records(state: State<'_, AppState>, project_id: Uuid) -> AppResult<()> {
    state.project(project_id)?.lock().clear_debug_records()
}

/// In the system's default app.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_sidecar_log(app: AppHandle) -> AppResult<()> {
    let dir = app.path().app_log_dir().map_err(|e| AppError::storage(e.to_string()))?;
    let path = dir.join(LOG_FILE);
    if !path.exists() {
        return Err(AppError::not_found("No sidecar log yet."));
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::new("open_failed", e.to_string()))
}

/// `third-party.json` written by `scripts/third-party.mjs`; `None` in dev builds.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_third_party(app: AppHandle) -> AppResult<Option<Value>> {
    let dir = app.path().resource_dir().map_err(|e| AppError::storage(e.to_string()))?;
    let path = dir.join("third-party.json");
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_str(&std::fs::read_to_string(path)?)?))
}

/// In the order written; read when the debug block is expanded.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_debug_records(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
    kind: String,
) -> AppResult<Vec<Value>> {
    state.project(project_id)?.lock().debug_records(message_id, &kind)
}

/// In the system's file manager.
#[tauri::command(rename_all = "snake_case")]
pub async fn reveal_asset(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: Uuid,
    asset_id: Uuid,
) -> AppResult<()> {
    let path = assets::file_path(&*state.project(project_id)?, asset_id)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| AppError::new("open_failed", e.to_string()))
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

/// `csv` is already written; the file is named after `title` and added by the user.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_table_csv(
    state: State<'_, AppState>,
    project_id: Uuid,
    title: String,
    csv: String,
) -> AppResult<AssetRef> {
    let project = state.project(project_id)?;
    let name = assets::table_file_name(&title);
    assets::import_bytes(&project, &name, "text/csv", csv.as_bytes(), &state.user())
}

/// On `start..end`, which reads `quote`; comments go through `send_message` on its Conversation.
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

/// Stops its running reply first.
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_thread(
    state: State<'_, AppState>,
    project_id: Uuid,
    thread_id: Uuid,
) -> AppResult<()> {
    let project = state.project(project_id)?;
    state.stop_replies(&project, thread_id)?;
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

/// Leaves the document as it is.
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
