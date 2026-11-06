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

#### Disappearing or invisible window on Wayland

**Symptom.** Parts of the Typist window, or the entire window, turn invisible or
stop repainting as the mouse moves across it. On Hyprland you may also see
`GDK Error 71` or WebKitGTK renderer aborts in the log.

**Cause.** WebKitGTK's DMABUF renderer is known to abort or drop surface
contents on Wayland compositors (Hyprland in particular), and a transparent
window surface can compound the corruption. Typist works around this on Linux by
setting `WEBKIT_DISABLE_DMABUF_RENDERER=1` before the WebKitGTK WebView is
created, but only when a Wayland display is present and only when you have not
already expressed a preference.

**Automatic behaviour.** When `WAYLAND_DISPLAY` is set, the Linux entry point
sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless any of these variables is
already present in your environment:

- `WEBKIT_DISABLE_DMABUF_RENDERER`
- `WEBKIT_DISABLE_COMPOSITING_MODE`
- `__NV_DISABLE_EXPLICIT_SYNC`
- `TYPIST_DISABLE_DMABUF`
- `TYPIST_DISABLE_COMPOSITING`

Variables you set explicitly are never overwritten. X11 sessions and
non-Linux platforms are completely unaffected, and GPU acceleration is not
disabled globally.

**NVIDIA.** On NVIDIA + Wayland, `__NV_DISABLE_EXPLICIT_SYNC=1` is often
preferable to disabling DMABUF because it keeps GPU rendering while avoiding
explicit-sync aborts. Typist does not detect your GPU or set this itself — if
you are on NVIDIA, try it manually first. `WEBKIT_DISABLE_COMPOSITING_MODE=1`
is a last-resort diagnostic fallback and is never enabled by default.

**Manual launch overrides**

```bash
typist                                  # automatic workaround under Wayland
WEBKIT_DISABLE_DMABUF_RENDERER=1 typist # force the DMABUF workaround
__NV_DISABLE_EXPLICIT_SYNC=1 typist     # NVIDIA explicit-sync workaround
WEBKIT_DISABLE_COMPOSITING_MODE=1 typist # last-resort diagnostic fallback
```

Typist-owned diagnostic overrides are also respected under Wayland:

- `TYPIST_DISABLE_DMABUF=1` force-enables `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- `TYPIST_DISABLE_COMPOSITING=1` force-enables `WEBKIT_DISABLE_COMPOSITING_MODE=1`.
- `TYPIST_DISABLE_DMABUF=0` opts out of the automatic DMABUF workaround.

Disabling the DMABUF renderer trades some rendering performance for stability.

**Collecting logs**

```bash
typist 2>&1 | tee /tmp/typist.log
```

Look for WebKitGTK/GDK aborts (e.g. `GDK Error 71`) and share `/tmp/typist.log`
when filing an issue.

## Branding

|  | Light Mode | Dark Mode |
| --- | --- | --- |
| **Primary** | `#FCFCFD` | `#1C1C1E` |
| **Secondary** | `#F2F2F7` | `#2C2C2E` |
| **Accent** | `#007AFF` | `#0A84FF` |
| **Text** | `#1D1D1F` | `#F5F5F7` |

## License

MIT
