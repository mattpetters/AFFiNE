#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

use server::{ADDRESS, ORIGIN};
use std::collections::HashSet;
use tauri::{
  Manager, WebviewUrl, WebviewWindowBuilder,
  webview::{DownloadEvent, NewWindowResponse},
};

fn open_external(url: &tauri::Url) {
  if matches!(url.scheme(), "https" | "http" | "mailto") {
    let _ = open::that(url.as_str());
  }
}

fn allow_navigation(url: &tauri::Url) -> bool {
  if url.origin().ascii_serialization() == ORIGIN || url.scheme() == "blob" {
    return true;
  }
  if matches!(url.as_str(), "about:blank" | "about:srcdoc") {
    return true;
  }
  // WKWebView also calls this handler for iframe navigations. Permit the
  // supported video players, while ordinary external links leave the app.
  url.scheme() == "https"
    && match url.host_str() {
      Some("www.youtube.com" | "youtube.com" | "www.youtube-nocookie.com" | "youtube-nocookie.com") => {
        url.path().starts_with("/embed/")
      }
      Some("player.vimeo.com") => url.path().starts_with("/video/"),
      _ => false,
    }
}

fn main() {
  let context = tauri::generate_context!();
  let asset_keys: HashSet<String> = context
    .assets()
    .iter()
    .map(|(key, _)| key.trim_start_matches('/').to_owned())
    .collect();
  tauri::Builder::default()
    .on_window_event(|window, event| {
      // Do not leave a windowless process holding the fixed storage origin.
      if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
        window.app_handle().exit(0);
      }
    })
    .setup(move |app| {
      let upstream = server::configured_upstream(&app.path().app_config_dir()?)?;
      let resolver = app.asset_resolver();
      if let Err(error) = server::start_server(move |key| {
        asset_keys.contains(key).then(|| resolver.get(key.into())).flatten().map(|asset| asset.bytes)
      }, upstream) {
        rfd::MessageDialog::new().set_title("AFFiNE Tauri could not start")
          .set_description(format!("Could not open {ADDRESS}: {error}. Quit any existing AFFiNE Tauri process and try again. Your data has not been changed."))
          .show();
        return Err(error);
      }
      let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(ORIGIN.parse()?))
        .title("AFFiNE Tauri")
        .inner_size(1360.0, 900.0)
        .min_inner_size(800.0, 600.0)
        .devtools(true)
        // Stable dedicated WKWebsiteDataStore. Never change without a migration.
        .data_store_identifier([0x8f, 0x21, 0x84, 0xa6, 0x1d, 0x46, 0x43, 0x93,
          0x8a, 0x61, 0xc5, 0xe8, 0x7f, 0x02, 0x00, 0x01])
        .initialization_script(include_str!("../bootstrap.js"))
        .on_navigation(|url| {
          if allow_navigation(url) { true } else { open_external(url); false }
        })
        .on_new_window(|url, _| { open_external(&url); NewWindowResponse::Deny })
        .on_download(|_, event| match event {
          DownloadEvent::Requested { destination, .. } => {
            let name = destination.file_name().unwrap_or_default().to_string_lossy();
            // rfd detects the main thread and runs NSSavePanel's modal loop
            // directly; no synchronous dispatch back to this callback's thread.
            if let Some(path) = rfd::FileDialog::new().set_file_name(name.as_ref()).save_file() {
              *destination = path;
              true
            } else { false }
          }
          DownloadEvent::Finished { success, path, .. } => {
            eprintln!("AFFiNE Tauri download: success={success}, path={path:?}");
            true
          }
          _ => true,
        })
        .build()?;
      let _ = window.set_focus();
      Ok(())
    })
    .run(context)
    .expect("AFFiNE Tauri runtime failed");
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn allows_embedded_players_without_allowing_arbitrary_navigation() {
    let allowed = |value: &str| allow_navigation(&value.parse().unwrap());
    assert!(allowed("http://127.0.0.1:47861/workspace/test"));
    assert!(allowed("about:blank"));
    assert!(allowed("https://www.youtube.com/embed/jNQXAC9IVRw"));
    assert!(!allowed("https://www.youtube.com/watch?v=jNQXAC9IVRw"));
    assert!(!allowed("https://www.youtube.com.evil.example/embed/video"));
    assert!(!allowed("file:///etc/passwd"));
  }
}
