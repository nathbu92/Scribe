// Évite d'ouvrir une console en plus sous Windows en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager};

/// Vrai si l'app peut se remplacer elle-même (sous Linux : seulement l'AppImage).
#[tauri::command]
fn can_self_update() -> bool {
    !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some()
}

/// Relance l'app après l'installation d'une mise à jour.
#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![can_self_update, restart_app])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Martinews Scribe");
}
