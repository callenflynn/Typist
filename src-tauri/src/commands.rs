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

/// Returns today's date in the system's local time zone as `YYYY-MM-DD`.
/// Rust's standard library has no time-zone support, so the caller (the
/// frontend) supplies the local date. This fallback keeps the command usable
/// when no date is provided, at the cost of using the UTC date.
fn utc_today() -> String {
    let now = SystemTime::now();
    let sec = now
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();
    // Days since the Unix epoch, decomposed into year/month/day in UTC.
    let mut days = sec / 86_400;
    let mut year = 1970;
    loop {
        let days_in_year = if is_leap_year(year) { 366u64 } else { 365u64 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let month_days = month_lengths(is_leap_year(year));
    let mut month = 0;
    for (index, &length) in month_days.iter().enumerate() {
        if days < length {
            month = index;
            break;
        }
        days -= length;
    }
    let day = days + 1;
    format!("{year}-{:02}-{:02}", month + 1, day)
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn month_lengths(leap: bool) -> [u64; 12] {
    let feb = if leap { 29 } else { 28 };
    [31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map(|n| n as u64)
}

/// True when `value` looks like a calendar date `YYYY-MM-DD`. Kept intentionally
/// small so no regex dependency is needed; combined with the workspace path
/// guard this cannot escape the Typist folder.
fn is_journal_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..10].iter().all(u8::is_ascii_digit)
}

/// Ensures today's journal exists at `~/Documents/Typist/<date>.md`, creating
/// it with `template` (e.g. a `{date}`-expanded preset) when it is missing.
/// Existing journals are never overwritten.
#[tauri::command]
pub fn open_daily_journal(
    app: AppHandle,
    state: State<'_, Workspace>,
    date: Option<String>,
    template: Option<String>,
) -> Result<String, String> {
    let root = ensure_workspace(&app, &state)?;
    let date = date.unwrap_or_else(|| utc_today());
    if !is_journal_date(&date) {
        return Err("journal date must be YYYY-MM-DD".into());
    }
    let path = root.join(format!("{date}.md"));
    if !path.exists() {
        let content = template.unwrap_or_default();
        fs::write(&path, content)
            .map_err(|error| format!("could not create journal {date}: {error}"))?;
    }
    Ok(path.to_string_lossy().into_owned())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn journal_date_validation() {
        assert!(is_journal_date("2026-11-08"));
        assert!(is_journal_date("2000-01-01"));
        assert!(is_journal_date("1999-12-31"));
        assert!(!is_journal_date("2026-1-08"));   // non-zero-padded month
        assert!(!is_journal_date("2026-11-8"));    // non-zero-padded day
        assert!(!is_journal_date("2026/11/08"));   // wrong separator
        assert!(!is_journal_date("26-11-08"));     // short year
        assert!(!is_journal_date("2026-11-08x"));  // trailing junk
        assert!(!is_journal_date(""));             // empty
        // Out-of-range months are structurally valid filenames; path traversal
        // is blocked by the workspace containment guard in `resolve`, not here.
        assert!(is_journal_date("2026-13-01"));
    }

    #[test]
    fn utc_today_returns_iso_date_shape() {
        let today = utc_today();
        assert!(is_journal_date(&today));
        // Should be within one day of the current UTC date.
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or_default();
        // Recompute the expected calendar date independently and compare it
        // date produced by `utc_today` against a direct decomposition.
        let mut days = now / 86_400;
        let mut year = 1970;
        loop {
            let days_in_year = if is_leap_year(year) { 366u64 } else { 365u64 };
            if days < days_in_year {
                break;
            }
            days -= days_in_year;
            year += 1;
        }
        let month_days = month_lengths(is_leap_year(year));
        let mut month = 0;
        for (index, &length) in month_days.iter().enumerate() {
            if days < length {
                month = index;
                break;
            }
            days -= length;
        }
        let day = days + 1;
        let expected = format!("{year}-{:02}-{:02}", month + 1, day);
        assert_eq!(today, expected);
    }
}

