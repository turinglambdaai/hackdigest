mod db;

use tauri::Manager;

/// Durable app data lives as JSON files in the OS app-config dir — the
/// WebView2 IndexedDB has proven unreliable in packaged builds (observed
/// never persisting, wiping on update). Allowed names: settings, library.
fn data_path(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    if !matches!(name, "settings" | "library") {
        return Err(format!("unknown data file: {name}"));
    }
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join(format!("{name}.json")))
}

#[tauri::command]
fn read_data_file(app: tauri::AppHandle, name: String) -> Option<String> {
    std::fs::read_to_string(data_path(&app, &name).ok()?).ok()
}

#[tauri::command]
fn write_data_file(app: tauri::AppHandle, name: String, json: String) -> Result<(), String> {
    let path = data_path(&app, &name)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| match db::init(app.handle()) {
            Ok(sqlite) => {
                app.manage(sqlite);

                // Guard: if the restored window position landed outside every
                // connected monitor (e.g. an external screen was unplugged),
                // pull it back to center instead of stranding the title bar.
                if let Some(win) = app.get_webview_window("main") {
                    let stranded = win
                        .available_monitors()
                        .map(|mons| {
                            let pos = win.outer_position().unwrap_or_default();
                            mons.iter().any(|m| {
                                let mp = m.position();
                                let ms = m.size();
                                pos.x + 120 > mp.x
                                    && pos.x < mp.x + ms.width as i32
                                    && pos.y + 40 > mp.y
                                    && pos.y < mp.y + ms.height as i32
                            })
                        })
                        .unwrap_or(false);
                    if !stranded {
                        let _ = win.center();
                    }
                }
                Ok(())
            }
            Err(e) => Err(e.into()),
        })
        .invoke_handler(tauri::generate_handler![
            read_data_file,
            write_data_file,
            db::kv_get,
            db::kv_set,
            db::get_translation,
            db::get_translations,
            db::put_translations,
            db::get_item,
            db::put_items
        ])
        .run(tauri::generate_context!())
        .expect("error while running hackdigest");
}
