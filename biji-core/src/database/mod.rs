mod connection;
mod folder_repo;
mod link_repo;
mod note_repo;
mod search;
mod tag_repo;

pub use connection::*;
pub use folder_repo::*;
pub use link_repo::*;
pub use note_repo::*;
pub use search::*;
pub use tag_repo::*;

use crate::models::*;
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

        db.run_migrations()?;
        log::info!("Database opened: {}", db_path.display());

        Ok(db)
    }

    /// 执行 SQL 迁移
    fn run_migrations(&self) -> Result<(), Error> {
        let conn = self.conn.lock().unwrap();
        let sql = include_str!("../../migrations/001_init.sql");
        conn.execute_batch(sql)?;
        Ok(())
    }

    /// 获取存储路径
    pub fn storage_path(&self) -> &str {
        // 从 db_path 截取目录
        Path::new(&self.db_path)
            .parent()
            .map(|p| p.to_string_lossy())
            .as_deref()
            .unwrap_or("")
    }

    /// 获取原始连接（内部使用）
    pub(crate) fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}
