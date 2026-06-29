pub mod database;
pub mod models;
pub mod services;
pub mod utils;

use std::path::Path;
use std::sync::Arc;

/// Biji Note 应用核心 — 所有功能的统一入口
///
/// # 使用方式
///
/// ```ignore
/// use biji_core::App;
///
/// let app = App::init("/path/to/data")?;
/// let notes = app.db.get_all_notes(false)?;
/// ```
pub struct App {
    pub db: Arc<database::Database>,
    pub settings: services::SettingsManager,
    pub encryption: services::EncryptionService,
    pub sync: services::SyncManager,
    pub git: services::GitService,
    pub publish: services::PublishService,
    pub plugin_mgr: services::PluginManager,
}

impl App {
    /// 初始化整个应用核心
    ///
    /// `data_dir`: 数据目录（包含 biji.db, settings.json 等）
    pub fn init(data_dir: &Path) -> Result<Self, utils::Error> {
        std::fs::create_dir_all(data_dir)?;

        // 1. 数据库
        let db_path = data_dir.join("biji.db");
        let db = Arc::new(database::Database::open(&db_path)?);

        // 2. 设置
        let settings_path = data_dir.join("settings.json");
        let mut settings = services::SettingsManager::load(&settings_path)?;

        // 3. 加密（确保密钥存在）
        let enc_key = if settings.get().encryption_key.is_empty() {
            let key = services::EncryptionService::new("").get_key_hex();
            let mut s = settings.get().clone();
            s.encryption_key = key.clone();
            settings.set(s)?;
            key
        } else {
            settings.get().encryption_key.clone()
        };
        let encryption = services::EncryptionService::new(&enc_key);

        // 4. 其他服务
        let sync = services::SyncManager::new(db.clone());
        let git = services::GitService::new(data_dir);
        let publish = services::PublishService::new(data_dir);
        let plugins_dir = data_dir.join("plugins");
        let plugin_mgr = services::PluginManager::new(db.clone(), &plugins_dir);

        log::info!("Biji Note core initialized at: {}", data_dir.display());

        Ok(Self {
            db,
            settings,
            encryption,
            sync,
            git,
            publish,
            plugin_mgr,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_init() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::init(dir.path());
        assert!(app.is_ok());
    }

    #[test]
    fn test_create_and_read_note() {
        let dir = tempfile::tempdir().unwrap();
        let app = App::init(dir.path()).unwrap();

        let note = models::Note {
            id: uuid::Uuid::new_v4().to_string(),
            title: "测试笔记".into(),
            content: "这是一篇测试笔记的内容".into(),
            folder_id: None,
            created_at: chrono::Utc::now().timestamp_millis(),
            updated_at: chrono::Utc::now().timestamp_millis(),
            tags: vec!["test".into()],
            is_encrypted: false,
            sync_status: models::SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        };

        app.db.save_note(&note).unwrap();
        let notes = app.db.get_all_notes(false).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "测试笔记");
    }
}
