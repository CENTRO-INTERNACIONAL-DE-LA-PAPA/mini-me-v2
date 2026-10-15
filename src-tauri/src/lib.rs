mod assets;
mod conversations;
mod db;
mod error;
mod history;
mod ipc;
mod library;
mod link;
mod paths;
mod projects;
mod protocol;
mod routing;
mod secrets;
mod settings;
mod sidecar;
mod store;
mod trait_calls;
mod updates;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let state = ipc::AppState::init(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::list_projects,
            ipc::create_project,
            ipc::open_project,
            ipc::list_conversations,
            ipc::create_conversation,
            ipc::subscribe_conversation,
            ipc::send_message,
            ipc::stop_reply,
            ipc::add_reaction,
            ipc::remove_reaction,
            ipc::import_assets,
            ipc::list_assets,
            ipc::open_asset,
            ipc::get_sidecar_status,
            ipc::subscribe_sidecar_status,
            ipc::restart_sidecar,
            ipc::list_mini_mes,
            ipc::get_ai_settings,
            ipc::set_ai_model,
            ipc::save_api_key,
            ipc::remove_api_key,
            ipc::set_routing_threshold,
            ipc::set_show_jev_answers,
            ipc::get_update_status,
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
