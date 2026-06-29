use crate::AppState;
use biji_core::models::{SyncResult, WebDAVConfig};
use tauri::State;

#[tauri::command]
pub fn sync_start(state: State<AppState>, config: WebDAVConfig) -> Result<SyncResult, String> {
    let app = state.core.lock().map_err(|e| e.to_string())?;
    app.sync.sync(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_status(state: State<AppState>) -> Result<biji_core::models::SyncStatus, String> {
    Ok(state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .sync
        .get_status())
}
