use tauri::Manager;

/// Settings survive app updates on the filesystem; IndexedDB has proven
/// unreliable across WebView2 updates (observed wiped in the wild).
#[tauri::command]
fn read_settings_file(app: tauri::AppHandle) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
fn write_settings_file(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("settings.json"), json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![read_settings_file, write_settings_file])
        .run(tauri::generate_context!())
        .expect("error while running hackdigest");
}
