mod ai2;
mod approvals;
mod assets;
mod comments;
mod components;
mod conversations;
mod db;
mod documents;
mod error;
mod history;
mod ipc;
mod library;
mod link;
mod overview;
mod paths;
mod projects;
mod recent;
mod protocol;
mod routing;
mod runs;
mod secrets;
mod settings;
mod sidecar;
mod store;
mod updates;
mod user_library;
mod user_profile;

use tauri::{DragDropEvent, Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let state = ipc::AppState::init(app.handle())?;
            let developer_mode = state.developer_mode();
            app.manage(state);
            // The window is made here rather than from the config so the web inspector exists
            // only in Developer mode; a change to it applies from the next launch.
            let window = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("the Tauri config defines no window")?;
            tauri::WebviewWindowBuilder::from_config(app.handle(), &window)?
                .devtools(developer_mode)
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                if let Some(state) = window.try_state::<ipc::AppState>() {
                    state.record_drop(paths.clone());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            ipc::list_projects,
            ipc::create_project,
            ipc::open_project,
            ipc::list_conversations,
            ipc::create_conversation,
            ipc::open_conversation,
            ipc::unsubscribe_conversation,
            ipc::reset_subscriptions,
            ipc::send_message,
            ipc::stop_reply,
            ipc::answer_approval,
            ipc::list_paused_approvals,
            ipc::list_recent_conversations,
            ipc::subscribe_running_replies,
            ipc::import_assets,
            ipc::import_pasted_image,
            ipc::import_dropped,
            ipc::read_image_asset,
            ipc::list_assets,
            ipc::list_project_files,
            ipc::get_overview,
            ipc::feature_component,
            ipc::update_overview_summary,
            ipc::open_asset,
            ipc::create_document,
            ipc::read_document,
            ipc::save_document,
            ipc::draft_document,
            ipc::stop_draft,
            ipc::export_document_pdf,
            ipc::preview_document,
            ipc::subscribe_sidecar_status,
            ipc::restart_sidecar,
            ipc::list_mini_mes,
            ipc::list_library,
            ipc::get_mini_me,
            ipc::save_mini_me,
            ipc::save_trait,
            ipc::delete_mini_me,
            ipc::delete_trait,
            ipc::get_user_profile,
            ipc::save_user_name,
            ipc::get_ai_settings,
            ipc::set_ai_model,
            ipc::save_api_key,
            ipc::remove_api_key,
            ipc::set_routing_threshold,
            ipc::set_show_jev_answers,
            ipc::get_developer_mode,
            ipc::set_developer_mode,
            ipc::get_home_settings,
            ipc::set_show_home_mini_mes,
            ipc::ai2_start_sign_in,
            ipc::subscribe_ai2_status,
            ipc::ai2_sign_out,
            ipc::subscribe_update_status,
            ipc::restart_to_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ipc::AppState>() {
                    state.sidecar.shutdown();
                    // After the sidecar stops, so the installer can replace its files.
                    state.updates.install_pending();
                }
            }
        });
}
