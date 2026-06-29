use crate::AppState;
use biji_core::models::Plugin;
use tauri::State;

#[tauri::command]
pub fn get_plugins(state: State<AppState>) -> Result<Vec<Plugin>, String> {
    Ok(state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .plugin_mgr
        .get_all())
}

#[tauri::command]
pub fn toggle_plugin(state: State<AppState>, id: String, enabled: bool) -> Result<(), String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .plugin_mgr
        .toggle(&id, enabled)
        .map_err(|e| e.to_string())
}
