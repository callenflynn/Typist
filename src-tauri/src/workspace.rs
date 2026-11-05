use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub children: Option<Vec<TreeEntry>>,
}

/// Resolves a requested path and refuses anything outside the Typist folder.
///
/// Existing paths are canonicalised, which also resolves symlinks before the
/// containment check. Missing paths are resolved through their canonical parent
/// so that a new file cannot be created through a `..` component or a link.
pub fn resolve(root: &Path, requested: &str) -> Result<PathBuf, String> {
    if requested.trim().is_empty() {
        return Err("missing file path".into());
    }

    let candidate = PathBuf::from(requested);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };

    let resolved = if candidate.exists() {
        candidate.canonicalize()
    } else {
        let parent = candidate.parent().ok_or("invalid file path")?;
        let parent = parent
            .canonicalize()
            .map_err(|error| format!("could not open {}: {error}", parent.display()))?;
        let name = candidate.file_name().ok_or("invalid file path")?;
        Ok(parent.join(name))
    }
    .map_err(|error| format!("could not resolve {}: {error}", candidate.display()))?;

    if !resolved.starts_with(root) {
        return Err("that path is outside your Typist folder".into());
    }
    Ok(resolved)
}

pub fn resolve_directory(root: &Path, requested: Option<&str>) -> Result<PathBuf, String> {
    let path = match requested {
        Some(path) if !path.trim().is_empty() => resolve(root, path)?,
        _ => root.to_path_buf(),
    };
    if !path.is_dir() {
        return Err("that folder no longer exists".into());
    }
    Ok(path)
}

pub fn sanitize_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("the name cannot be empty".into());
    }
    if name.len() > 120 {
        return Err("that name is too long".into());
    }
    if name == "." || name == ".." || name.starts_with('.') {
        return Err("that name is not allowed".into());
    }
    if name.chars().any(|character| {
        matches!(
            character,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
        ) || character.is_control()
    }) {
        return Err("names cannot contain / \\ : * ? \" < > |".into());
    }
    Ok(name.to_string())
}

pub fn note_name(index: usize) -> String {
    if index == 1 {
        "Untitled.md".into()
    } else {
        format!("Untitled {index}.md")
    }
}

pub fn folder_name(index: usize) -> String {
    if index == 1 {
        "New folder".into()
    } else {
        format!("New folder {index}")
    }
}

fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// Reads one level of the workspace tree, recursing into real directories.
///
/// Symlinks and dotfiles are skipped: links can escape the workspace or form
/// cycles, and hidden files are not notes the user opened in Typist.
pub fn walk(directory: &Path) -> Vec<TreeEntry> {
    let Ok(read) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut entries = Vec::new();

    for entry in read.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }

        let path = entry.path().to_string_lossy().into_owned();
        if file_type.is_dir() {
            let children = walk(&entry.path());
            entries.push(TreeEntry {
                name,
                path,
                directory: true,
                children: Some(children),
            });
        } else if is_markdown(&name) {
            entries.push(TreeEntry {
                name,
                path,
                directory: false,
                children: None,
            });
        }
    }

    entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("typist-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn names_are_sanitised() {
        assert!(sanitize_name("   ").is_err());
        assert!(sanitize_name("..").is_err());
        assert!(sanitize_name(".hidden").is_err());
        assert!(sanitize_name("a/b").is_err());
        assert!(sanitize_name("a\\b").is_err());
        assert!(sanitize_name("why?what").is_err());
        assert_eq!(sanitize_name("  Ideas  ").unwrap(), "Ideas");
    }

    #[test]
    fn paths_stay_inside_the_workspace() {
        let root = temp_root("paths");
        assert!(resolve(&root, "../escape.md").is_err());
        assert!(resolve(&root, "/etc/passwd").is_err());

        assert_eq!(resolve(&root, "note.md").unwrap(), root.join("note.md"));
        fs::create_dir_all(root.join("Nested")).unwrap();
        assert_eq!(
            resolve(&root, "Nested/note.md").unwrap(),
            root.join("Nested").join("note.md")
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn walk_lists_notes_and_skips_hidden_entries() {
        let root = temp_root("walk");
        fs::write(root.join("Alpha.md"), "# Alpha").unwrap();
        fs::write(root.join("notes.txt"), "ignore me").unwrap();
        fs::write(root.join(".hidden.md"), "ignore me").unwrap();
        fs::create_dir_all(root.join("Folder")).unwrap();
        fs::write(root.join("Folder").join("Beta.markdown"), "# Beta").unwrap();

        let entries = walk(&root);
        assert_eq!(entries.len(), 2);
        assert!(entries[0].directory);
        assert_eq!(entries[0].name, "Folder");
        assert_eq!(entries[1].name, "Alpha.md");
        assert_eq!(
            entries[0].children.as_ref().unwrap()[0].name,
            "Beta.markdown"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn walk_does_not_follow_symlinks() {
        let root = temp_root("links");
        fs::write(root.join("Real.md"), "real").unwrap();
        std::os::unix::fs::symlink(root.join("Real.md"), root.join("Link.md")).unwrap();
        std::os::unix::fs::symlink("/etc", root.join("Outside")).unwrap();

        let entries = walk(&root);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Real.md");

        fs::remove_dir_all(&root).unwrap();
    }
}
