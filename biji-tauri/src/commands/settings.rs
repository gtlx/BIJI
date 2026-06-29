use crate::AppState;
use biji_core::models::AppSettings;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    Ok(state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .settings
        .get()
        .clone())
}

#[tauri::command]
pub fn set_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .settings
        .set(settings)
        .map_err(|e| e.to_string())
}
