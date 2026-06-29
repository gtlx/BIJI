use biji_core::models::{SearchQuery, SyncStatus};
use biji_core::App;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "biji", about = "Biji Note CLI — 跨平台笔记编辑器命令行工具")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// 创建新笔记
    New { title: String },
    /// 列出所有笔记
    List,
    /// 搜索笔记
    Search { keyword: String },
    /// 查看笔记内容
    Show { id: String },
    /// 删除笔记（移到回收站）
    Delete { id: String },
    /// 恢复已删除笔记
    Restore { id: String },
    /// 列出所有文件夹
    Folder,
    /// 触发云端同步
    Sync,
    /// 显示应用状态
    Status,
    /// 从 Markdown 目录导入笔记
    Import { path: String },
    /// 导出笔记到 Markdown 目录
    Export { path: String },
}

fn get_data_dir() -> std::path::PathBuf {
    // 与 Tauri 版共用数据目录
    dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("biji-note")
}

fn main() {
    env_logger::init();
    let cli = Cli::parse();

    // 数据目录不存在时也初始化
    let data_dir = get_data_dir();
    if !data_dir.exists() {
        eprintln!("Biji Note data directory not found: {:?}", data_dir);
        eprintln!(
            "Please run the desktop app first to initialize, or create the directory manually."
        );
        std::process::exit(1);
    }

    let app = match App::init(&data_dir) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Failed to initialize: {}", e);
            std::process::exit(1);
        }
    };

    let result = match cli.command {
        Commands::New { title } => cmd_new(&app, &title),
        Commands::List => cmd_list(&app),
        Commands::Search { keyword } => cmd_search(&app, &keyword),
        Commands::Show { id } => cmd_show(&app, &id),
        Commands::Delete { id } => cmd_delete(&app, &id),
        Commands::Restore { id } => cmd_restore(&app, &id),
        Commands::Folder => cmd_folder(&app),
        Commands::Sync => cmd_sync(&app),
        Commands::Status => cmd_status(&app),
        Commands::Import { path } => cmd_import(&app, &path),
        Commands::Export { path } => cmd_export(&app, &path),
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

fn cmd_new(app: &App, title: &str) -> Result<(), biji_core::utils::Error> {
    let note = biji_core::models::Note {
        id: uuid::Uuid::new_v4().to_string(),
        title: title.to_string(),
        content: String::new(),
        folder_id: None,
        created_at: chrono::Utc::now().timestamp_millis(),
        updated_at: chrono::Utc::now().timestamp_millis(),
        tags: vec![],
        is_encrypted: false,
        sync_status: SyncStatus::Pending,
        deleted_at: None,
        frontmatter: None,
    };
    app.db.save_note(&note)?;
    println!("Created note: {} ({})", note.title, note.id);
    Ok(())
}

fn cmd_list(app: &App) -> Result<(), biji_core::utils::Error> {
    let notes = app.db.get_all_notes(false)?;
    if notes.is_empty() {
        println!("No notes found.");
        return Ok(());
    }
    println!("Total: {} notes\n", notes.len());
    for note in &notes {
        let date = chrono::DateTime::from_timestamp_millis(note.updated_at)
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| "unknown".into());
        let tags = if note.tags.is_empty() {
            String::new()
        } else {
            format!(" [{}]", note.tags.join(", "))
        };
        println!("[{}] {}{}", date, note.title, tags);
    }
    Ok(())
}

fn cmd_search(app: &App, keyword: &str) -> Result<(), biji_core::utils::Error> {
    let query = SearchQuery {
        keyword: Some(keyword.to_string()),
        ..Default::default()
    };
    let notes = app.db.search_notes(&query)?;
    if notes.is_empty() {
        println!("No notes found matching \"{}\"", keyword);
        return Ok(());
    }
    println!("Found {} notes:\n", notes.len());
    for note in &notes {
        println!("- {} ({})", note.title, &note.id[..8]);
    }
    Ok(())
}

fn cmd_show(app: &App, id: &str) -> Result<(), biji_core::utils::Error> {
    let note = app
        .db
        .get_note(id)?
        .ok_or_else(|| biji_core::utils::Error::NotFound(format!("Note not found: {}", id)))?;

    let date = chrono::DateTime::from_timestamp_millis(note.updated_at)
        .map(|d| d.to_string())
        .unwrap_or_else(|| "unknown".into());

    println!("ID:      {}", note.id);
    println!("Title:   {}", note.title);
    println!("Updated: {}", date);
    if !note.tags.is_empty() {
        println!("Tags:    {}", note.tags.join(", "));
    }
    println!("---");
    println!("{}", note.content);
    Ok(())
}

fn cmd_delete(app: &App, id: &str) -> Result<(), biji_core::utils::Error> {
    app.db.delete_note(id, false)?;
    println!("Note {} moved to trash", &id[..8]);
    Ok(())
}

fn cmd_restore(app: &App, id: &str) -> Result<(), biji_core::utils::Error> {
    app.db.restore_note(id)?;
    println!("Note {} restored", &id[..8]);
    Ok(())
}

fn cmd_folder(app: &App) -> Result<(), biji_core::utils::Error> {
    let folders = app.db.get_all_folders(false)?;
    if folders.is_empty() {
        println!("No folders found.");
        return Ok(());
    }
    println!("Total: {} folders\n", folders.len());
    for folder in &folders {
        println!("  {} ({})", folder.name, &folder.id[..8]);
    }
    Ok(())
}

fn cmd_sync(app: &App) -> Result<(), biji_core::utils::Error> {
    // CLI 同步需要 WebDAV 配置
    let settings = app.settings.get();
    if !settings.sync_enabled {
        println!("Sync is not enabled. Enable it in settings first.");
        return Ok(());
    }

    let config = biji_core::models::WebDAVConfig {
        url: settings.sync_web_url.clone(),
        username: Some(settings.sync_web_username.clone()),
        password: Some(settings.sync_web_password.clone()),
        base_path: Some("/biji".into()),
    };

    println!("Starting sync...");
    let result = app.sync.sync(&config)?;
    if result.success {
        println!(
            "Sync completed: {} uploaded, {} downloaded",
            result.uploaded, result.downloaded
        );
    } else {
        eprintln!("Sync failed: {:?}", result.error);
    }
    Ok(())
}

fn cmd_status(app: &App) -> Result<(), biji_core::utils::Error> {
    let notes = app.db.get_all_notes(false)?;
    let folders = app.db.get_all_folders(false)?;
    let settings = app.settings.get();

    println!("Biji Note Status");
    println!("================");
    println!("Database:  {:?}", std::path::Path::new(".").join("biji.db"));
    println!("Notes:     {}", notes.len());
    println!("Folders:   {}", folders.len());
    println!(
        "Sync:      {}",
        if settings.sync_enabled {
            "enabled"
        } else {
            "disabled"
        }
    );
    println!("Theme:     {:?}", settings.theme);
    println!();
    println!("Recent notes:");
    for note in notes.iter().take(5) {
        println!("  - {}", note.title);
    }
    Ok(())
}

fn cmd_import(app: &App, path: &str) -> Result<(), biji_core::utils::Error> {
    let import_path = std::path::Path::new(path);
    if !import_path.exists() {
        return Err(biji_core::utils::Error::NotFound(format!(
            "Path not found: {}",
            path
        )));
    }

    let mut count = 0u32;
    let mut save_note = |note: biji_core::models::Note| -> Result<(), biji_core::utils::Error> {
        app.db.save_note(&note)?;
        count += 1;
        Ok(())
    };
    let mut save_folder =
        |folder: biji_core::models::Folder| -> Result<(), biji_core::utils::Error> {
            app.db.save_folder(&folder)?;
            Ok(())
        };

    biji_core::services::ImportExportService::import_from_markdown(
        import_path,
        &mut save_note,
        &mut save_folder,
    )?;

    println!("Imported {} notes from {}", count, path);
    Ok(())
}

fn cmd_export(app: &App, path: &str) -> Result<(), biji_core::utils::Error> {
    let export_path = std::path::Path::new(path).join("biji-export");
    std::fs::create_dir_all(&export_path)?;

    let notes = app.db.get_all_notes(false)?;
    let folders = app.db.get_all_folders(false)?;

    // 建立文件夹ID → 名称映射
    let folder_name: std::collections::HashMap<Option<String>, String> = folders
        .iter()
        .map(|f| (Some(f.id.clone()), f.name.clone()))
        .collect();

    // 分组
    let mut by_folder: std::collections::HashMap<Option<String>, Vec<&biji_core::models::Note>> =
        std::collections::HashMap::new();
    for note in &notes {
        by_folder
            .entry(note.folder_id.clone())
            .or_default()
            .push(note);
    }

    // 导出根目录笔记
    if let Some(root_notes) = by_folder.get(&None) {
        for note in root_notes {
            let filename = format!("{}.md", slugify(&note.title));
            let content = format!("# {}\n\n{}", note.title, note.content);
            std::fs::write(export_path.join(&filename), content)?;
        }
    }

    // 导出有文件夹的笔记
    for note in &notes {
        if let Some(ref fid) = note.folder_id {
            if let Some(fname) = folder_name.get(&Some(fid.clone())) {
                let dir = export_path.join(slugify(fname));
                std::fs::create_dir_all(&dir)?;
                let filename = format!("{}.md", slugify(&note.title));
                let content = format!("# {}\n\n{}", note.title, note.content);
                std::fs::write(dir.join(&filename), content)?;
            }
        }
    }

    println!("Exported {} notes to {:?}", notes.len(), export_path);
    Ok(())
}

fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>()
        .trim()
        .replace(' ', "_")
        .replace("__", "_")
}
