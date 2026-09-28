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
        .invoke_handler(tauri::generate_handler![read_data_file, write_data_file])
        .run(tauri::generate_context!())
        .expect("error while running hackdigest");
}
