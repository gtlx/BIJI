pub mod commands;

use biji_core::App;
use std::sync::Mutex;

/// Tauri 管理的全局应用状态
pub struct AppState {
    pub core: Mutex<App>,
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::mobile_entry_point]
pub fn run_mobile() {
    run()
}

pub fn run() {
    let data_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("biji-note");

    let app = App::init(&data_dir).expect("Failed to initialize Biji Note core");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            core: Mutex::new(app),
        })
        .invoke_handler(tauri::generate_handler![
            // 笔记
            commands::notes::get_notes,
            commands::notes::get_note,
            commands::notes::save_note,
            commands::notes::delete_note,
            commands::notes::search_notes,
            commands::notes::get_graph_data,
            // 文件夹
            commands::folders::get_folders,
            commands::folders::save_folder,
            commands::folders::delete_folder,
            // 设置
            commands::settings::get_settings,
            commands::settings::set_settings,
            // 同步
            commands::sync::sync_start,
            commands::sync::sync_status,
            // Git
            commands::git::git_init,
            commands::git::git_status,
            commands::git::git_commit,
            commands::git::git_log,
            // 发布
            commands::publish::publish_site,
            commands::publish::check_generator,
            // 导入导出
            commands::io::import_markdown,
            commands::io::export_markdown,
            // 插件
            commands::plugin::get_plugins,
            commands::plugin::toggle_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
