# Typist

Typist is a minimal, local-first Markdown editor designed for distraction-free writing.

Open it, write, and it saves. Notes are plain `.md` files in `~/Documents/Typist`.
There is no account, database, or vault to configure.

## What it does

- Creates `~/Documents/Typist` and a short `Welcome.md` on first launch.
- Reopens the note you were writing last.
- Creates, renames, and deletes notes and folders in the sidebar, with nested folders.
- Saves 600 ms after you stop typing, and immediately with `Ctrl/Cmd+S`.
- Shows `Saved`, `Unsaved`, `Saving…`, or `Could not save` beside the file name.
- Flushes pending changes before switching notes and before the window closes.
- Supports CommonMark and GitHub Flavored Markdown: headings, emphasis, lists,
  task lists, links, blockquotes, code blocks, and tables.
- Remembers the light or dark theme.
- `Ctrl/Cmd+Shift+F` hides the sidebar for focus mode.

Saves are serialised through one queue and written to a temporary file before the
real note is replaced, so an older save cannot overwrite newer text and an
interrupted write cannot truncate a note.

## Development

Requires [Bun](https://bun.sh) and the Tauri 2 system dependencies.

```sh
bun install
bun run tauri dev     # desktop app
bun run typecheck
bun run build         # frontend bundle used by the desktop app
bun test              # save queue and path unit tests
cargo test --manifest-path src-tauri/Cargo.toml
```

`bun run dev` starts only the Vite shell. Without the Tauri runtime there is no
filesystem access, so use the desktop app to write notes.

The `Makefile` wraps the same commands, plus `make package-arch` for Arch Linux.

## Storage

All file access goes through the Rust commands in `src-tauri/src/commands.rs`:

- The workspace is resolved once to `~/Documents/Typist` and created if missing.
- Every path is canonicalised and checked against that folder, so `..` components
  and symlinks cannot reach files outside it.
- Symlinks and dotfiles are skipped when listing the workspace.
- Notes are read as UTF-8 and written through a temporary file.

Notes live only in that folder. The app locally remembers just your open note and
theme preference, and never rewrites a note without an edit.

## Arch Linux

The repository includes an Arch package recipe under `packaging/arch`:

```sh
make package-arch
sudo pacman -U typist-*.pkg.tar.zst
```

The package installs `typist` in `/usr/bin`, a desktop launcher, the application
icon, and Markdown MIME associations. Runtime dependencies are WebKitGTK, GTK3,
and the usual Tauri stack from the official Arch repositories.

### Hyprland

Typist uses a borderless, resizable Tauri window with an in-app title bar, so it
does not require server-side decorations. The launcher works from `wofi`,
`rofi-wayland`, or any `.desktop`-aware menu:

```ini
# ~/.config/hypr/hyprland.conf
bind = $mod, T, exec, typist
```

The Linux entry point sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` when running under
Wayland, which avoids the WebKitGTK renderer abort seen on Hyprland and other
compositors. Explicit user settings are left untouched.

## Branding

|  | Light Mode | Dark Mode |
| --- | --- | --- |
| **Primary** | `#FCFCFD` | `#1C1C1E` |
| **Secondary** | `#F2F2F7` | `#2C2C2E` |
| **Accent** | `#007AFF` | `#0A84FF` |
| **Text** | `#1D1D1F` | `#F5F5F7` |

## License

MIT
