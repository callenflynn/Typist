mod commands;

use commands::{WindowState, WorkspaceState};

pub fn run() {
    tauri::Builder::default()
        .manage(WindowState::default())
        .manage(WorkspaceState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::window_snapshot,
            commands::initialize_workspace,
            commands::create_workspace,
            commands::create_vault,
            commands::open_daily_journal,
            commands::list_workspace,
            commands::read_workspace_file,
            commands::write_workspace_file,
            commands::choose_workspace,
            commands::choose_markdown_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Typist");
}
