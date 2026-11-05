use crate::workspace::{self, TreeEntry};
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};

const WORKSPACE_FOLDER: &str = "Typist";
const WELCOME_FILE: &str = "Welcome.md";

const WELCOME_MARKDOWN: &str = r#"# Welcome to Typist

Typist is a minimal, local-first Markdown editor. Everything you write lives in
plain `.md` files under `Documents/Typist`, so any other Markdown editor can
open it.

## Getting started

- Choose a note in the sidebar, or create one with the new-note button.
- Type normally; Markdown is formatted as you write.
- Your work saves automatically, and **Ctrl/Cmd+S** saves immediately.
- Use the row buttons to rename or delete a note or folder.

That is everything there is to configure. Have fun writing.
"#;

/// The Typist folder is resolved once, then every command is scoped to it.
#[derive(Default)]
pub struct Workspace(pub Mutex<Option<PathBuf>>);

#[derive(Serialize)]
pub struct WorkspaceInfo {
    pub root: String,
    pub welcome: String,
}

fn ensure_workspace(app: &AppHandle, state: &State<'_, Workspace>) -> Result<PathBuf, String> {
    if let Some(root) = state
        .0
        .lock()
        .map_err(|_| "workspace is unavailable".to_string())?
        .clone()
    {
        return Ok(root);
    }

    let documents = app
        .path()
        .resolve("Documents", BaseDirectory::Home)
        .map_err(|error| format!("could not locate your Documents folder: {error}"))?;
    let folder = documents.join(WORKSPACE_FOLDER);
    fs::create_dir_all(&folder)
        .map_err(|error| format!("could not create {}: {error}", folder.display()))?;
    let root = folder
        .canonicalize()
        .map_err(|error| format!("could not open {}: {error}", folder.display()))?;

    *state
        .0
        .lock()
        .map_err(|_| "workspace is unavailable".to_string())? = Some(root.clone());
    Ok(root)
}

fn timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default()
}

#[tauri::command]
pub fn initialize_workspace(
    app: AppHandle,
    state: State<'_, Workspace>,
) -> Result<WorkspaceInfo, String> {
    let root = ensure_workspace(&app, &state)?;
    let welcome = root.join(WELCOME_FILE);
    if !welcome.exists() {
        fs::write(&welcome, WELCOME_MARKDOWN)
            .map_err(|error| format!("could not create {}: {error}", welcome.display()))?;
    }
    Ok(WorkspaceInfo {
        root: root.to_string_lossy().into_owned(),
        welcome: welcome.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn list_notes(app: AppHandle, state: State<'_, Workspace>) -> Result<Vec<TreeEntry>, String> {
    let root = ensure_workspace(&app, &state)?;
    Ok(workspace::walk(&root))
}

#[tauri::command]
pub fn read_note(
    app: AppHandle,
    state: State<'_, Workspace>,
    path: String,
) -> Result<String, String> {
    let root = ensure_workspace(&app, &state)?;
    let path = workspace::resolve(&root, &path)?;
    if !path.is_file() {
        return Err("that note no longer exists".into());
    }
    fs::read_to_string(&path).map_err(|error| format!("could not open {}: {error}", path.display()))
}

#[tauri::command]
pub fn write_note(
    app: AppHandle,
    state: State<'_, Workspace>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let root = ensure_workspace(&app, &state)?;
    let path = workspace::resolve(&root, &path)?;
    let parent = path.parent().ok_or("invalid file path")?;
    if !parent.is_dir() {
        return Err("the note's folder no longer exists".into());
    }

    // Write to a sibling file first so an interrupted save cannot truncate a
    // note. `rename` replaces atomically on Unix; Windows needs the copy path.
    let temp = parent.join(format!(
        ".typist-save-{}-{}.tmp",
        std::process::id(),
        timestamp()
    ));
    let written = fs::File::create(&temp)
        .and_then(|mut file| {
            file.write_all(contents.as_bytes())?;
            file.sync_all()
        })
        .and_then(|()| match fs::rename(&temp, &path) {
            Ok(()) => Ok(()),
            Err(_) if path.exists() => fs::copy(&temp, &path).map(|_| ()),
            Err(error) => Err(error),
        });

    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written.map_err(|error| format!("could not save {}: {error}", path.display()))
}

#[tauri::command]
pub fn create_note(
    app: AppHandle,
    state: State<'_, Workspace>,
    directory: Option<String>,
) -> Result<String, String> {
    let root = ensure_workspace(&app, &state)?;
    let directory = workspace::resolve_directory(&root, directory.as_deref())?;

    for index in 1..10_000 {
        let candidate = directory.join(workspace::note_name(index));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(_) => return Ok(candidate.to_string_lossy().into_owned()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "could not create a note in {}: {error}",
                    directory.display()
                ))
            }
        }
    }
    Err("could not find a free note name".into())
}

#[tauri::command]
pub fn create_folder(
    app: AppHandle,
    state: State<'_, Workspace>,
    directory: Option<String>,
) -> Result<String, String> {
    let root = ensure_workspace(&app, &state)?;
    let directory = workspace::resolve_directory(&root, directory.as_deref())?;

    for index in 1..10_000 {
        let candidate = directory.join(workspace::folder_name(index));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate.to_string_lossy().into_owned()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("could not create a folder: {error}")),
        }
    }
    Err("could not find a free folder name".into())
}

#[tauri::command]
pub fn rename_entry(
    app: AppHandle,
    state: State<'_, Workspace>,
    path: String,
    name: String,
) -> Result<String, String> {
    let root = ensure_workspace(&app, &state)?;
    let source = workspace::resolve(&root, &path)?;
    if source == root {
        return Err("the Typist folder cannot be renamed".into());
    }

    let name = workspace::sanitize_name(&name)?;
    let file_name = if source.is_dir() || name.to_lowercase().ends_with(".md") {
        name
    } else {
        format!("{name}.md")
    };

    let parent = source.parent().ok_or("invalid file path")?;
    let target = parent.join(file_name);
    if target == source {
        return Ok(target.to_string_lossy().into_owned());
    }
    if target.exists() {
        return Err("an item with that name already exists".into());
    }

    fs::rename(&source, &target).map_err(|error| format!("could not rename: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_entry(
    app: AppHandle,
    state: State<'_, Workspace>,
    path: String,
) -> Result<(), String> {
    let root = ensure_workspace(&app, &state)?;
    let path = workspace::resolve(&root, &path)?;
    if path == root {
        return Err("the Typist folder cannot be deleted".into());
    }

    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| format!("could not delete {}: {error}", path.display()))?;
    let result = if metadata.is_dir() {
        fs::remove_dir_all(&path)
    } else {
        fs::remove_file(&path)
    };
    result.map_err(|error| format!("could not delete {}: {error}", path.display()))
}
