use crate::AppState;
use biji_core::models::{GraphData, Note, SearchQuery};
use tauri::State;

#[tauri::command]
pub fn get_notes(
    state: State<AppState>,
    include_deleted: Option<bool>,
) -> Result<Vec<Note>, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .get_all_notes(include_deleted.unwrap_or(false))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_note(state: State<AppState>, id: String) -> Result<Option<Note>, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .get_note(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_note(state: State<AppState>, note: Note) -> Result<(), String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .save_note(&note)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(
    state: State<AppState>,
    id: String,
    permanent: Option<bool>,
) -> Result<(), String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .delete_note(&id, permanent.unwrap_or(false))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_notes(state: State<AppState>, query: SearchQuery) -> Result<Vec<Note>, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .search_notes(&query)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_graph_data(state: State<AppState>) -> Result<GraphData, String> {
    state
        .core
        .lock()
        .map_err(|e| e.to_string())?
        .db
        .get_graph_data()
        .map_err(|e| e.to_string())
}
