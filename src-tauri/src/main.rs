#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use typist_lib::apply_linux_graphics_workarounds;

fn main() {
    // Apply Linux / Wayland graphics workarounds *before* Tauri creates the
    // WebKitGTK WebView. User-provided variables are never overwritten.
    #[cfg(target_os = "linux")]
    apply_linux_graphics_workarounds();
    typist_lib::run();
}
