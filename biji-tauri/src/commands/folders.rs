use crate::AppState;
use biji_core::models::Folder;
use tauri::State;

#[tauri::command]
pub fn get_folders(
    state: State<AppState>,
    include_deleted: Option<bool>,
) -> Result<Vec<Folder>, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .get_all_folders(include_deleted.unwrap_or(false))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_folder(state: State<AppState>, folder: Folder) -> Result<(), String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .save_folder(&folder)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_folder(
    state: State<AppState>,
    id: String,
    permanent: Option<bool>,
) -> Result<(), String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .delete_folder(&id, permanent.unwrap_or(false))
        .map_err(|e| e.to_string())
}
