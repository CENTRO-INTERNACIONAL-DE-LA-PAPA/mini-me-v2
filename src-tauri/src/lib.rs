mod assets;
mod conversations;
mod db;
mod error;
mod ipc;
mod link;
mod paths;
mod projects;
mod protocol;
mod secrets;
mod settings;
mod sidecar;
mod store;
mod trait_calls;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ipc::AppState>() {
                    state.sidecar.shutdown();
                }
            }
        });
}
