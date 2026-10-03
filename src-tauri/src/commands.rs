use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::Mutex;

#[derive(Default)]
pub struct WindowState(pub Mutex<WindowSnapshot>);

#[derive(Default, Serialize)]
pub struct WindowSnapshot {
    pub focused: bool,
    pub maximized: bool,
}

#[derive(Default)]
pub struct WorkspaceState(pub Mutex<Option<PathBuf>>);

#[derive(Serialize)]
pub struct WorkspaceInfo {
    pub root: String,
    pub welcome: String,
}

const WELCOME_MARKDOWN: &str = r#"# Welcome to Typist

Typist is a quiet, local-first Markdown editor. Your files live in:

`Documents/Typist`

## A few basics

- Choose a Markdown file from the left sidebar to open it.
- Type normally; Markdown formatting appears as you write.
- Files save automatically, or use **Ctrl/Cmd+S** to save immediately.
- Use **Ctrl/Cmd+Shift+F** for a distraction-free focus mode.
- Use the sun/moon button to switch between light and dark themes.

Everything stays on your computer. Add, rename, and organize Markdown files in
your Typist folder with your normal file manager.
"#;

#[tauri::command]
pub async fn initialize_workspace(app: AppHandle, state: State<'_, WorkspaceState>) -> Result<WorkspaceInfo, String> {
    let documents = app.path().resolve("Documents", BaseDirectory::Home).map_err(|error| error.to_string())?;
    let root = documents.join("Typist");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let welcome = root.join("Welcome.md");
    let welcome_is_empty = fs::metadata(&welcome).map(|metadata| metadata.len() == 0).unwrap_or(true);
    if welcome_is_empty {
        fs::write(&welcome, WELCOME_MARKDOWN).map_err(|error| error.to_string())?;
    }
    let root = canonical_workspace(&root)?;
    let welcome = root.join("Welcome.md");
    *state.0.lock().await = Some(root.clone());
    Ok(WorkspaceInfo { root: root.to_string_lossy().into_owned(), welcome: welcome.to_string_lossy().into_owned() })
}

fn canonical_workspace(root: &Path) -> Result<PathBuf, String> {
    root.canonicalize().map_err(|error| format!("invalid workspace: {error}"))
}

fn safe_path(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let root = canonical_workspace(root)?;
    let path = PathBuf::from(requested);
    let candidate = if path.is_absolute() { path } else { root.join(path) };
    let canonical = if candidate.exists() {
        candidate.canonicalize().map_err(|error| error.to_string())?
    } else {
        let parent = candidate.parent().ok_or("invalid file path")?.canonicalize().map_err(|error| error.to_string())?;
        parent.join(candidate.file_name().ok_or("invalid file path")?)
    };
    if canonical == root || !canonical.starts_with(&root) {
        return Err("path is outside the workspace".into());
    }
    Ok(canonical)
}

#[tauri::command]
pub async fn window_snapshot(app: AppHandle, state: State<'_, WindowState>) -> Result<WindowSnapshot, String> {
    let window = app.get_webview_window("main").ok_or("main window not found")?;
    let snapshot = WindowSnapshot { focused: window.is_focused().unwrap_or(false), maximized: window.is_maximized().unwrap_or(false) };
    *state.0.lock().await = WindowSnapshot { focused: snapshot.focused, maximized: snapshot.maximized };
    Ok(snapshot)
}

#[derive(Serialize)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub children: Option<Vec<TreeEntry>>,
}

fn walk(path: &Path, root: &Path) -> Result<Vec<TreeEntry>, String> {
    let mut entries = fs::read_dir(path).map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| !path.file_name().is_some_and(|name| name == ".git"))
        .map(|path| {
            let directory = path.is_dir();
            Ok(TreeEntry { name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(), path: path.to_string_lossy().into_owned(), directory, children: directory.then(|| walk(&path, root)).transpose()? })
        })
        .collect::<Result<Vec<_>, String>>()?;
    entries.sort_by_key(|entry| (!entry.directory, entry.name.to_lowercase()));
    let _ = root;
    Ok(entries)
}

fn validate_vault_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err("vault name must be a simple folder name".into());
    }
    Ok(name)
}

async fn initialize_vault(root: PathBuf, name: &str, state: State<'_, WorkspaceState>) -> Result<String, String> {
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("Journal")).map_err(|error| error.to_string())?;
    let readme = root.join("README.md");
    if !readme.exists() {
        fs::write(&readme, format!("# {name}\n\nYour local Typist vault.\n")).map_err(|error| error.to_string())?;
    }
    let root = canonical_workspace(&root)?;
    *state.0.lock().await = Some(root.clone());
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_vault(app: AppHandle, name: String, custom_parent: Option<String>, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let name = validate_vault_name(&name)?;
    let parent = match custom_parent {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => app.path().resolve("Documents", BaseDirectory::Home).map_err(|error| error.to_string())?,
    };
    initialize_vault(parent.join(name), name, state).await
}

#[tauri::command]
pub async fn create_workspace(app: AppHandle, name: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    create_vault(app, name, None, state).await
}

#[tauri::command]
pub async fn open_daily_journal(state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root = state.0.lock().await.clone().ok_or("vault is not selected")?;
    let journal = root.join("Journal");
    fs::create_dir_all(&journal).map_err(|error| error.to_string())?;
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let path = journal.join(format!("{date}.md"));
    if !path.exists() {
        fs::write(&path, format!("# {date}\n\n")).map_err(|error| error.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_workspace(path: String, state: State<'_, WorkspaceState>) -> Result<Vec<TreeEntry>, String> {
    let root = canonical_workspace(Path::new(&path))?;
    *state.0.lock().await = Some(root.clone());
    walk(&root, &root)
}

#[tauri::command]
pub async fn read_workspace_file(path: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root = state.0.lock().await.clone().ok_or("vault is not selected")?;
    fs::read_to_string(safe_path(&root, &path)?).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn write_workspace_file(path: String, contents: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root = state.0.lock().await.clone().ok_or("vault is not selected")?;
    fs::write(safe_path(&root, &path)?, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn choose_workspace(app: AppHandle, state: State<'_, WorkspaceState>) -> Result<Option<String>, String> {
    let selected = app.dialog().file().set_title("Choose vault").blocking_pick_folder();
    let Some(path) = selected else { return Ok(None); };
    let path = path.into_path().map_err(|error| error.to_string())?;
    let root = canonical_workspace(&path)?;
    *state.0.lock().await = Some(root.clone());
    Ok(Some(root.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn choose_markdown_file(app: AppHandle) -> Option<String> {
    app.dialog().file().add_filter("Markdown", &["md", "markdown"]).blocking_pick_file().and_then(|path| path.into_path().ok()).map(|path| path.to_string_lossy().into_owned())
}
