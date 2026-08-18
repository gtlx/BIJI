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

/// [M4] 导出版本:把库(notes + 各自块)导出为 Obsidian md 文件夹,并在该文件夹 git add + commit
///
/// 真实后端执行(DB 取笔记与块 → 导出 → libgit2 提交);Tauri 壳 M6 接入后由前端 invoke 触发。
/// 返回本次提交 hash。导出目录 = 数据目录下的 `export/`(GitService repo_path 子目录)。
#[tauri::command]
pub fn git_export_commit(
    state: State<AppState>,
    message: String,
) -> Result<Option<String>, String> {
    let core = state.core.lock().map_err(|e| e.to_string())?;
    // 取未删除笔记
    let notes = core.db.get_all_notes(false).map_err(|e| e.to_string())?;
    // 导出目录 = 数据目录/export(GitService 的 repo_path 是数据目录)
    let export_dir = std::path::Path::new(core.git.repo_path()).join("export");
    // block_provider:每篇笔记取其实时块(块时间戳 → md 注释)
    let provider = |note_id: &str| core.block_service.get_note_blocks(note_id);
    core.git
        .export_and_commit(&notes, &provider, &export_dir, &message)
        .map_err(|e| e.to_string())
}

