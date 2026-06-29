use biji_core::models::{Folder, Note};
use biji_core::services::ImportExportService;
use biji_core::utils::Error as CoreError;
use std::path::Path;
use std::sync::Mutex;

/// 带回调的导入（因为 Tauri command 需要同步调用）
pub fn import_markdown_internal(
    db: &Mutex<biji_core::App>,
    import_path: &str,
) -> Result<biji_core::services::ImportResult, String> {
    let path = Path::new(import_path);
    let mut save_note = |note: Note| -> Result<(), CoreError> {
        db.lock()
            .map_err(|e| CoreError::General(e.to_string()))?
            .db
            .save_note(&note)
    };
    let mut save_folder = |folder: Folder| -> Result<(), CoreError> {
        db.lock()
            .map_err(|e| CoreError::General(e.to_string()))?
            .db
            .save_folder(&folder)
    };

    ImportExportService::import_from_markdown(path, &mut save_note, &mut save_folder)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_markdown(
    state: tauri::State<crate::AppState>,
    path: String,
) -> Result<biji_core::services::ImportResult, String> {
    import_markdown_internal(&state.core, &path)
}

#[tauri::command]
pub fn export_markdown(
    state: tauri::State<crate::AppState>,
    export_path: String,
) -> Result<biji_core::services::ImportResult, String> {
    // 导出为 Markdown 文件
    let path = Path::new(&export_path);
    let base_path = path.join("biji-export");
    std::fs::create_dir_all(&base_path).map_err(|e| e.to_string())?;

    let app = state.core.lock().map_err(|e| e.to_string())?;
    let notes = app.db.get_all_notes(false).map_err(|e| e.to_string())?;
    let folders = app.db.get_all_folders(false).map_err(|e| e.to_string())?;

    // 按文件夹分组导出的简单实现
    let folder_map: std::collections::HashMap<Option<String>, Vec<&Note>> = {
        let mut map: std::collections::HashMap<Option<String>, Vec<&Note>> =
            std::collections::HashMap::new();
        for note in &notes {
            map.entry(note.folder_id.clone()).or_default().push(note);
        }
        map
    };

    // 导出根目录的笔记
    if let Some(root_notes) = folder_map.get(&None) {
        for note in root_notes {
            let content = format!("# {}\n\n{}", note.title, note.content);
            let filename = format!("{}.md", slugify(&note.title));
            std::fs::write(base_path.join(&filename), content).map_err(|e| e.to_string())?;
        }
    }

    // 导出有文件夹的笔记
    for folder in &folders {
        let folder_path = base_path.join(slugify(&folder.name));
        std::fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

        if let Some(folder_notes) = folder_map.get(&Some(folder.id.clone())) {
            for note in folder_notes {
                let content = format!("# {}\n\n{}", note.title, note.content);
                let filename = format!("{}.md", slugify(&note.title));
                std::fs::write(folder_path.join(&filename), content).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(biji_core::services::ImportResult {
        success: true,
        count: notes.len() as u32,
        error: None,
    })
}

fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == ' ' || *c == '_')
        .collect::<String>()
        .trim()
        .replace(' ', "_")
}
