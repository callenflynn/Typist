mod commands;
mod workspace;

use commands::Workspace;

pub fn run() {
    tauri::Builder::default()
        .manage(Workspace::default())
        .invoke_handler(tauri::generate_handler![
            commands::initialize_workspace,
            commands::list_notes,
            commands::read_note,
            commands::write_note,
            commands::create_note,
            commands::create_folder,
            commands::rename_entry,
            commands::delete_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running Typist");
}
