mod block_repo;
mod connection;
mod folder_repo;
mod link_repo;
mod migrations;
mod note_repo;
mod search;
mod tag_repo;
mod template_repo;

pub use connection::*;
pub use search::{search_by_mode, SearchModeResult};

use crate::models::note::SyncStatus;
use crate::models::Note;
use crate::utils::frontmatter::parse_frontmatter;
use crate::utils::Error;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

/// 数据库管理器 — 所有数据持久化的统一入口
pub struct Database {
    conn: Mutex<Connection>,
    db_path: String,
}

impl Database {
    /// 打开（或创建）数据库
    pub fn open(db_path: &Path) -> Result<Self, Error> {
        let conn = Connection::open(db_path)?;

        // WAL 模式：更好的并发性能
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        let db = Self {
            conn: Mutex::new(conn),
            db_path: db_path.to_string_lossy().to_string(),
        };

        migrations::run(&db.conn())?;
        log::info!("Database opened: {}", db_path.display());

        Ok(db)
    }

    /// 获取数据库文件路径
    pub fn db_path(&self) -> &str {
        &self.db_path
    }

    /// 获取存储目录路径
    pub fn storage_path(&self) -> String {
        // 从 db_path 截取目录
        Path::new(&self.db_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
    }

    /// 获取原始连接（内部使用）
    pub(crate) fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("Database mutex poisoned in conn()")
    }
}

/// 从 SQLite 行构建 Note（含 frontmatter 解析）
pub(crate) fn note_from_row(row: &rusqlite::Row) -> rusqlite::Result<Note> {
    let content: String = row.get("content")?;
    let frontmatter = parse_frontmatter(&content).map(|(fm, _)| fm);
    Ok(Note {
        id: row.get("id")?,
        title: row.get("title")?,
        content,
        folder_id: row.get("folder_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        is_encrypted: row.get::<_, i32>("is_encrypted")? != 0,
        sync_status: serde_json::from_str(&format!(
            "\"{}\"",
            row.get::<_, String>("sync_status")?
        ))
        .unwrap_or(SyncStatus::Pending),
        deleted_at: row.get("deleted_at")?,
        tags: Vec::new(),
        frontmatter,
    })
}
