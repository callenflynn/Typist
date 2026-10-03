# Typist

A small, local-first Markdown editor and daily journal.

## Linux quick start

Typist is a Tauri 2 desktop app. The repository keeps the common workflows behind
`make` so development does not depend on an IDE or desktop environment.

```sh
make install    # install JavaScript dependencies
make check      # typecheck and build the web app
make tauri-dev  # run the desktop app
make build      # build the release binary
```

The Makefile prefers Bun (matching `bun.lock`), then falls back to pnpm or npm for
contributors who already have one of those tools installed.

## Arch Linux

The repository includes an Arch package recipe under `packaging/arch`:

```sh
make package-arch
sudo pacman -U typist-*.pkg.tar.zst
```

The package installs `typist` in `/usr/bin`, a desktop launcher, the application
icon, and Markdown MIME associations. Runtime dependencies include WebKitGTK and
GTK3, which are available in the official Arch repositories.

### Hyprland

Typist uses a borderless, resizable Tauri window with an in-app title bar. This
keeps the UI consistent with Hyprland and avoids requiring server-side decorations.
The launcher works from `wofi`, `rofi-wayland`, or any `.desktop`-aware menu:

```ini
# ~/.config/hypr/hyprland.conf
bind = $mod, T, exec, typist
```

Use `Ctrl/Cmd+Shift+F` for a distraction-free focus mode, `Ctrl/Cmd+O` to open a
Markdown file, and `Ctrl/Cmd+S` to flush the current file immediately. Files remain
local and are also saved automatically after a short pause while typing.

## Development notes

The editor uses Milkdown with CommonMark and GFM support. The Arch build creates a
native binary rather than an AppImage, which makes it friendlier to package
managers and Wayland compositors.


## Branding

This project utilizes the following scheme:
|  | Light Mode | Dark Mode |
| --- | --- | --- |
| **Primary** | `#FCFCFD` | `#1C1C1E` |
| **Secondary** | `#F2F2F7` | `#2C2C2E` |
| **Accent** | `#007AFF` | `#0A84FF` |
| **Background** | `#FCFCFD` | `#1C1C1E` |
| **Text** | `#1D1D1F` | `#F5F5F7` |

## License

MIT
