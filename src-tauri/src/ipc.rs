//! Tauri commands and the per-Conversation event channel.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::assets;
use crate::conversations::{self, ConversationSummary, SendMessageInput};
use crate::error::{AppError, AppResult};
use crate::projects::{self, ProjectSummary};
use crate::protocol::{AssetRef, Author, AuthorKind, Event, Message, now_ms};
use crate::secrets::NoSecrets;
use crate::settings::Settings;
use crate::sidecar::{Launch, SidecarLog, SidecarState, SidecarStatus, Supervisor, Timing};
use crate::store::{EventSink, Project};
use crate::trait_calls::{CANCEL_TIMEOUT, TraitCalls};
use crate::updates::{UpdateStatus, Updates};

/// Until Mini-Mes exist, every user message is answered by this Trait.
const REPLY_TRAIT: &str = "echo";

pub struct AppState {
    config_dir: PathBuf,
    data_root: PathBuf,
    settings: Mutex<Settings>,
    open_projects: Mutex<HashMap<Uuid, Arc<Project>>>,
    calls: Arc<TraitCalls>,
    pub sidecar: Arc<Supervisor>,
    pub updates: Arc<Updates>,
}

impl AppState {
    pub fn init(app: &AppHandle) -> AppResult<Self> {
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
        let calls = Arc::new(TraitCalls::new(Box::new(NoSecrets), Arc::clone(&log), CANCEL_TIMEOUT));
        let sidecar = Supervisor::new(
            launch,
            false,
            Timing::for_build(),
            Arc::clone(&calls),
            Arc::clone(&log),
        );
        sidecar.spawn();
        let updates = Updates::new(log);
        if !cfg!(debug_assertions) {
            updates.spawn(app.clone());
        }
        Ok(Self {
            settings: Mutex::new(Settings::load_or_create(&config_dir)?),
            data_root: projects::ensure_data_root(&documents)?,
            config_dir,
            open_projects: Mutex::new(HashMap::new()),
            calls,
            sidecar,
            updates,
        })
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

struct ChannelSink(Channel<Event>);

impl EventSink for ChannelSink {
    fn send(&self, event: &Event) -> bool {
        self.0.send(event.clone()).is_ok()
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

#[tauri::command(rename_all = "snake_case")]
pub async fn subscribe_conversation(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
    after_seq: i64,
    on_event: Channel<Event>,
) -> AppResult<()> {
    state
        .project(project_id)?
        .subscribe(conversation_id, after_seq, Box::new(ChannelSink(on_event)))
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
    let message =
        conversations::send_message(&project, conversation_id, input, state.settings().user_id)?;
    let input = serde_json::json!({ "text": message.content });
    if let Err(err) = state.calls.start(project, conversation_id, &message, REPLY_TRAIT, input) {
        eprintln!("could not start a reply: {err}");
    }
    Ok(message)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_reply(
    state: State<'_, AppState>,
    project_id: Uuid,
    conversation_id: Uuid,
) -> AppResult<()> {
    let stopped = conversations::stop_reply(&*state.project(project_id)?, conversation_id)?;
    for message_id in stopped {
        state.calls.cancel_message(message_id);
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_sidecar_status(state: State<'_, AppState>) -> AppResult<SidecarStatus> {
    Ok(state.sidecar.status())
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

#[tauri::command(rename_all = "snake_case")]
pub async fn restart_sidecar(state: State<'_, AppState>) -> AppResult<()> {
    state.sidecar.restart();
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_update_status(state: State<'_, AppState>) -> AppResult<UpdateStatus> {
    Ok(state.updates.status())
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

#[tauri::command(rename_all = "snake_case")]
pub async fn add_reaction(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
    emoji: String,
) -> AppResult<()> {
    conversations::add_reaction(&*state.project(project_id)?, message_id, &emoji, state.user())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn remove_reaction(
    state: State<'_, AppState>,
    project_id: Uuid,
    message_id: Uuid,
    emoji: String,
) -> AppResult<()> {
    conversations::remove_reaction(&*state.project(project_id)?, message_id, &emoji, state.user())
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
        imported.push(assets::import(&project, &path)?);
    }
    Ok(imported)
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
