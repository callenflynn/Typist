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
            commands::open_daily_journal,
            commands::create_note,
            commands::create_folder,
            commands::rename_entry,
            commands::delete_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running Typist");
}

// -----------------------------------------------------------------------------
// Linux / Wayland graphics workarounds
//
// WebKitGTK's DMABUF renderer can abort or drop surface contents on Wayland
// compositors (notably Hyprland), which makes Typist's window partially or
// fully invisible while the mouse moves. The functions below select the
// workaround *before* Tauri creates the WebKitGTK WebView. They are gated on
// WAYLAND_DISPLAY, apply only on Linux, and never overwrite values the user
// set manually. See README.md ("Linux / Wayland") for the user-facing
// documentation of these variables.
// -----------------------------------------------------------------------------

use std::{env, sync::Mutex};

/// Serializes access to the process environment, which is global and not
/// safe to read or write concurrently. Keeps these tests hermetic under
/// `cargo test`'s default parallel execution.
static ENV_GUARD: Mutex<()> = Mutex::new(());

/// Wayland display socket advertised by a running compositor.
const WAYLAND_DISPLAY: &str = "WAYLAND_DISPLAY";

/// Typist-owned diagnostic overrides. Setting one to `1` opts into the
/// corresponding workaround; they are read only under Wayland.
const TYPIST_DISABLE_DMABUF: &str = "TYPIST_DISABLE_DMABUF";
const TYPIST_DISABLE_COMPOSITING: &str = "TYPIST_DISABLE_COMPOSITING";

/// WebKitGTK / NVIDIA variables the user may set explicitly. Typist never
/// overwrites these, so a manual launch environment always wins.
const WEBKIT_DISABLE_DMABUF_RENDERER: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
const WEBKIT_DISABLE_COMPOSITING_MODE: &str = "WEBKIT_DISABLE_COMPOSITING_MODE";
const NV_DISABLE_EXPLICIT_SYNC: &str = "__NV_DISABLE_EXPLICIT_SYNC";

/// All environment variables consulted by this module, for test snapshotting.
const GRAPHICS_VARS: [&str; 6] = [
    WAYLAND_DISPLAY,
    WEBKIT_DISABLE_DMABUF_RENDERER,
    WEBKIT_DISABLE_COMPOSITING_MODE,
    NV_DISABLE_EXPLICIT_SYNC,
    TYPIST_DISABLE_DMABUF,
    TYPIST_DISABLE_COMPOSITING,
];

/// True when a Wayland compositor is present.
pub fn is_wayland() -> bool {
    env::var_os(WAYLAND_DISPLAY)
        .map(|value| !value.is_empty())
        .unwrap_or(false)
}

/// True when the user has already expressed an explicit graphics preference
/// that Typist must not touch.
fn graphics_preference_is_explicit() -> bool {
    GRAPHICS_VARS[1..]
        .iter()
        .any(|name| env::var_os(name).is_some())
}

/// Default automatic workaround: disable WebKitGTK's DMABUF renderer under
/// Wayland, unless the user already expressed a preference.
pub fn should_apply_default_wayland_workaround() -> bool {
    is_wayland() && !graphics_preference_is_explicit()
}

/// Diagnostic override `TYPIST_DISABLE_DMABUF=1`: force the DMABUF renderer
/// off under Wayland, unless the user set `WEBKIT_DISABLE_DMABUF_RENDERER`
/// themselves.
pub fn should_force_dmabuf_disable() -> bool {
    is_wayland()
        && env::var(TYPIST_DISABLE_DMABUF).ok().as_deref() == Some("1")
        && env::var_os(WEBKIT_DISABLE_DMABUF_RENDERER).is_none()
}

/// Diagnostic override `TYPIST_DISABLE_COMPOSITING=1`: force WebKitGTK
/// compositing off. This is never applied automatically — it is a
/// user-requested diagnostic fallback only.
pub fn should_force_compositing_disable() -> bool {
    is_wayland()
        && env::var(TYPIST_DISABLE_COMPOSITING).ok().as_deref() == Some("1")
        && env::var_os(WEBKIT_DISABLE_COMPOSITING_MODE).is_none()
}

/// True only when the user explicitly requested the NVIDIA explicit-sync
/// workaround (`__NV_DISABLE_EXPLICIT_SYNC=1`). Typist never sets this
/// variable itself; on NVIDIA + Wayland it is often preferable to disabling
/// DMABUF because it keeps GPU rendering while avoiding explicit-sync aborts.
pub fn nv_disable_explicit_sync_requested() -> bool {
    env::var(NV_DISABLE_EXPLICIT_SYNC).ok().as_deref() == Some("1")
}

/// Apply the Linux graphics workarounds by setting WebKitGTK environment
/// variables.
///
/// Must be called before Tauri creates the WebKitGTK WebView — i.e. before
/// [`tauri::Builder::run`]. On non-Linux platforms this is a no-op, so X11
/// and every other platform are left completely untouched.
pub fn apply_linux_graphics_workarounds() {
    if cfg!(target_os = "linux") {
        if should_apply_default_wayland_workaround() || should_force_dmabuf_disable() {
            set_env_var(WEBKIT_DISABLE_DMABUF_RENDERER, "1");
        }
        if should_force_compositing_disable() {
            set_env_var(WEBKIT_DISABLE_COMPOSITING_MODE, "1");
        }
    }
}

fn set_env_var(key: &str, value: &str) {
    // `std::env::set_var` is a safe function on this toolchain/edition. If a
    // future toolchain requires an unsafe block, the adjustment is localized
    // here.
    env::set_var(key, value);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs `f` with the listed variables temporarily assigned (or removed
    /// when the value is `None`), then restores the previous environment,
    /// even if `f` panics.
    fn with_env(pairs: &[(&str, Option<&str>)], f: impl FnOnce()) {
        use std::ffi::OsString;
        let _guard = ENV_GUARD.lock().expect("environment guard poisoned");
        let snapshots: Vec<Option<OsString>> =
            GRAPHICS_VARS.iter().map(|var| env::var_os(var)).collect();
        for (var, value) in pairs {
            match value {
                Some(value) => env::set_var(var, value),
                None => env::remove_var(var),
            }
        }
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
        for (var, snapshot) in GRAPHICS_VARS.iter().zip(snapshots) {
            match snapshot {
                Some(value) => {
                    let _ = env::set_var(var, value);
                }
                None => env::remove_var(var),
            }
        }
        drop(_guard);
        result.expect("test panicked");
    }

    #[test]
    fn non_wayland_receives_no_wayland_settings() {
        with_env(
            &[(WAYLAND_DISPLAY, None), (TYPIST_DISABLE_DMABUF, Some("1"))],
            || {
                apply_linux_graphics_workarounds();
                assert!(env::var_os(WEBKIT_DISABLE_DMABUF_RENDERER).is_none());
                assert!(env::var_os(WEBKIT_DISABLE_COMPOSITING_MODE).is_none());
                assert!(!is_wayland());
            },
        );
    }

    #[test]
    fn empty_wayland_display_is_not_wayland() {
        with_env(&[(WAYLAND_DISPLAY, Some(""))], || {
            assert!(!is_wayland());
        });
    }

    #[test]
    fn default_wayland_workaround_applies_when_nothing_is_explicit() {
        with_env(&[(WAYLAND_DISPLAY, Some("0"))], || {
            apply_linux_graphics_workarounds();
            assert_eq!(
                env::var(WEBKIT_DISABLE_DMABUF_RENDERER),
                Ok(String::from("1"))
            );
            assert!(env::var_os(WEBKIT_DISABLE_COMPOSITING_MODE).is_none());
        });
    }

    #[test]
    fn explicit_webkit_disable_dmabuf_renderer_is_preserved() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (WEBKIT_DISABLE_DMABUF_RENDERER, Some("0")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert_eq!(
                    env::var(WEBKIT_DISABLE_DMABUF_RENDERER),
                    Ok(String::from("0"))
                );
                assert!(env::var_os(WEBKIT_DISABLE_COMPOSITING_MODE).is_none());
            },
        );
    }

    #[test]
    fn explicit_webkit_disable_compositing_mode_is_preserved() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (WEBKIT_DISABLE_COMPOSITING_MODE, Some("1")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert_eq!(
                    env::var(WEBKIT_DISABLE_COMPOSITING_MODE),
                    Ok(String::from("1"))
                );
                assert!(env::var_os(WEBKIT_DISABLE_DMABUF_RENDERER).is_none());
            },
        );
    }

    #[test]
    fn explicit_nv_disable_explicit_sync_is_preserved() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (NV_DISABLE_EXPLICIT_SYNC, Some("1")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert_eq!(env::var(NV_DISABLE_EXPLICIT_SYNC), Ok(String::from("1")));
                assert!(env::var_os(WEBKIT_DISABLE_DMABUF_RENDERER).is_none());
                assert!(env::var_os(WEBKIT_DISABLE_COMPOSITING_MODE).is_none());
                assert!(nv_disable_explicit_sync_requested());
            },
        );
    }

    #[test]
    fn default_fallback_is_skipped_when_any_explicit_preference_exists() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (TYPIST_DISABLE_DMABUF, Some("0")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert!(env::var_os(WEBKIT_DISABLE_DMABUF_RENDERER).is_none());
            },
        );
    }

    #[test]
    fn typist_disable_dmabuf_override_forces_dmabuf_off() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (TYPIST_DISABLE_DMABUF, Some("1")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert_eq!(
                    env::var(WEBKIT_DISABLE_DMABUF_RENDERER),
                    Ok(String::from("1"))
                );
            },
        );
    }

    #[test]
    fn user_explicit_dmabuf_wins_over_typist_override() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (WEBKIT_DISABLE_DMABUF_RENDERER, Some("0")),
                (TYPIST_DISABLE_DMABUF, Some("1")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert_eq!(
                    env::var(WEBKIT_DISABLE_DMABUF_RENDERER),
                    Ok(String::from("0"))
                );
            },
        );
    }

    #[test]
    fn typist_disable_compositing_override_applies_only_when_requested() {
        with_env(
            &[
                (WAYLAND_DISPLAY, Some("0")),
                (TYPIST_DISABLE_COMPOSITING, Some("1")),
            ],
            || {
                apply_linux_graphics_workarounds();
                assert_eq!(
                    env::var(WEBKIT_DISABLE_COMPOSITING_MODE),
                    Ok(String::from("1"))
                );
                // Explicit preference present -> the DMABUF default is skipped.
                assert!(env::var_os(WEBKIT_DISABLE_DMABUF_RENDERER).is_none());
            },
        );
    }

    #[test]
    fn compositing_is_not_disabled_by_default() {
        with_env(&[(WAYLAND_DISPLAY, Some("0"))], || {
            apply_linux_graphics_workarounds();
            assert!(env::var_os(WEBKIT_DISABLE_COMPOSITING_MODE).is_none());
        });
    }

    #[test]
    fn is_wayland_detects_display_variable() {
        with_env(&[(WAYLAND_DISPLAY, Some("0"))], || assert!(is_wayland()));
        with_env(&[(WAYLAND_DISPLAY, None)], || assert!(!is_wayland()));
        with_env(&[(WAYLAND_DISPLAY, Some(""))], || assert!(!is_wayland()));
    }
}
