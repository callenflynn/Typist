#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn configure_wayland_webkit() {
    // WebKitGTK's DMABUF renderer can abort with GDK Error 71 on Hyprland
    // and other Wayland compositors. Keep X11 and explicit user settings intact.
    if std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_wayland_webkit();
    typist_lib::run();
}
