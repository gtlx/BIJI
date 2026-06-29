use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn git_init(state: State<AppState>) -> Result<bool, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .git
        .init()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_status(state: State<AppState>) -> Result<biji_core::services::GitStatus, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .git
        .status()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_commit(state: State<AppState>, message: String) -> Result<Option<String>, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .git
        .commit(&message)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_log(
    state: State<AppState>,
    count: Option<i32>,
) -> Result<Vec<biji_core::services::GitLogEntry>, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .git
        .log(count.unwrap_or(20))
        .map_err(|e| e.to_string())
}
