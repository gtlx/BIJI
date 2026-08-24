use crate::models::Block;
use crate::utils::blocks::split_markdown_blocks;
use crate::utils::Error;
use rusqlite::Connection;
use uuid::Uuid;

/// 版本化迁移入口(PRAGMA user_version 门控)
///
/// - 001_init.sql:CREATE TABLE IF NOT EXISTS 幂等,每次执行
/// - 002_blocks.sql:user_version < 2 时执行,并对存量笔记按段落/标题拆块
///   (首次升级自动拆分,notes.content 保留原内容完整)
pub fn run(conn: &Connection) -> Result<(), Error> {
    // 001:初始 schema(幂等)
    conn.execute_batch(include_str!("../../migrations/001_init.sql"))?;

    // 插件启用状态持久化表(幂等,不参与 user_version 门控以保持迁移测试稳定)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS plugin_state (
            id      TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1
        );",
    )?;

    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < 2 {
        migrate_to_v2(conn)?;
    }

    if version < 3 {
        migrate_to_v3(conn)?;
    }

    Ok(())
}

/// [M3.5b] 003:块软删字段 + 模板表 + 内置模板种入
fn migrate_to_v3(conn: &Connection) -> Result<(), Error> {
    let tx = conn.unchecked_transaction()?;

    // 建表/加列/索引 + 内置模板基础种入(SQL 部分)
    tx.execute_batch(include_str!("../../migrations/003_trash_templates.sql"))?;

    // 用 Rust 补全内置模板的完整中文内容(比 SQL 内嵌长篇更易维护)
    let now = chrono::Utc::now().timestamp_millis();
    let builtins: [(&str, &str, &str, &str); 4] = [
        ("blank", "空白笔记", "blank", ""),
        (
            "diary",
            "日记",
            "diary",
            "# {{date}}\n\n## 天气\n\n## 今日要点\n\n## 明日计划\n",
        ),
        (
            "meeting",
            "会议",
            "meeting",
            "# {{date}} 会议纪要\n\n## 会议主题\n\n## 议程\n- \n- \n- \n\n## 讨论要点\n\n## 待办事项\n- [ ] \n- [ ] \n",
        ),
        (
            "reading",
            "读书",
            "reading",
            "# 《书名》读书笔记\n\n> 作者:  \n> 阅读日期: {{date}}\n\n## 内容概要\n\n## 我的笔记\n\n## 精彩摘录\n> \n",
        ),
    ];

    for (id, name, category, content) in builtins {
        tx.execute(
            "INSERT INTO templates (id, name, category, content, is_builtin, created_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               category = excluded.category,
               content = excluded.content,
               is_builtin = 1",
            rusqlite::params![id, name, category, content, now],
        )?;
    }

    tx.execute_batch("PRAGMA user_version = 3")?;
    tx.commit()?;

    log::info!("Migration 003 applied: blocks.deleted_at + templates table + builtins");
    Ok(())
}

/// 002:块表 + 历史表 + 存量笔记拆块(单事务,失败整体回滚)
fn migrate_to_v2(conn: &Connection) -> Result<(), Error> {
    let tx = conn.unchecked_transaction()?;

    // 1. 建块表/历史表/索引
    tx.execute_batch(include_str!("../../migrations/002_blocks.sql"))?;

    // 2. 存量笔记首次拆块:按段落/标题拆,块时间戳以笔记 updated_at 赋初值
    let note_rows: Vec<(String, String, i64)> = {
        let mut stmt = tx.prepare("SELECT id, content, updated_at FROM notes WHERE deleted_at IS NULL")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        out
    };

    let mut block_count: usize = 0;
    let note_count = note_rows.len();
    for (note_id, content, ts) in note_rows {
        let drafts = split_markdown_blocks(&content);
        for (order, draft) in drafts.iter().enumerate() {
            let block = Block {
                id: Uuid::new_v4().to_string(),
                note_id: note_id.clone(),
                parent_id: None,
                block_type: draft.block_type,
                content: draft.content.clone(),
                created_at: ts,
                updated_at: ts,
                sort_order: order as i64,
            };
            tx.execute(
                "INSERT INTO blocks (id, note_id, parent_id, type, content, created_at, updated_at, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    block.id,
                    block.note_id,
                    block.parent_id,
                    block.block_type.as_str(),
                    block.content,
                    block.created_at,
                    block.updated_at,
                    block.sort_order,
                ],
            )?;
            block_count += 1;
        }
    }

    // 3. 版本号置 2
    tx.execute_batch("PRAGMA user_version = 2")?;
    tx.commit()?;

    log::info!("Migration 002 applied: {} notes split into {} blocks", note_count, block_count);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::models::{Note, SyncStatus};

    /// 构造一篇含 frontmatter/标题/段落/列表的存量笔记
    fn make_note() -> Note {
        Note {
            id: Uuid::new_v4().to_string(),
            title: "存量笔记".into(),
            content: "---\ntitle: 存量笔记\n---\n\n# 旧标题\n\n旧段落内容。\n\n- 旧列表项\n".into(),
            folder_id: None,
            created_at: 1_000,
            updated_at: 2_000,
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        }
    }

    /// 模拟"旧库升级":建库 → 存笔记 → 回退 user_version 并删块表 → 重开触发迁移
    #[test]
    fn test_migration_v2_splits_existing_notes() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("biji.db");
        let note = make_note(); // 固定同一笔记(迁移拆出的块归属同一 id)

        // 第一轮:建库 + 存存量笔记(此时 user_version 已是 2)
        {
            let db = Database::open(&db_path).unwrap();
            db.save_note(&note).unwrap();
        }

        // 模拟旧版本状态:删掉块相关表,user_version 回退到 1
        {
            let db = Database::open(&db_path).unwrap();
            let conn = db.conn();
            conn.execute_batch("DROP TABLE block_history; DROP TABLE blocks; PRAGMA user_version = 1;")
                .unwrap();
        }

        // 第二轮重开:应触发 002 迁移并自动拆块
        let db = Database::open(&db_path).unwrap();
        // 注意:conn 守卫随作用域释放,之后才能再走 db 方法(Mutex 不可重入)
        let version: i64 = {
            let conn = db.conn();
            conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap()
        };
        assert_eq!(version, 3);

        let blocks = db.get_note_blocks(&note.id).unwrap();
        // frontmatter 不进块;标题/段落/列表项 = 3 块
        assert_eq!(blocks.len(), 3, "存量笔记应自动拆成 3 块,实际: {:?}", blocks.iter().map(|b| &b.content).collect::<Vec<_>>());
        assert_eq!(blocks[0].content, "# 旧标题");
        assert_eq!(blocks[0].block_type.as_str(), "heading");
        assert_eq!(blocks[1].content, "旧段落内容。");
        assert_eq!(blocks[2].content, "- 旧列表项");
        assert_eq!(blocks[2].block_type.as_str(), "list_item");
        // 排序正确
        assert_eq!(blocks.iter().map(|b| b.sort_order).collect::<Vec<_>>(), vec![0, 1, 2]);
        // 时间戳以笔记 updated_at 赋初值(save_note 会把 updated_at 盖成当前时间)
        let saved = db.get_note(&note.id).unwrap().unwrap();
        assert_eq!(blocks[0].created_at, saved.updated_at);
        assert_eq!(blocks[0].updated_at, saved.updated_at);
        // 原笔记内容完整保留
        let note2 = db.get_note(&note.id).unwrap().unwrap();
        assert!(note2.content.contains("旧段落内容。"));
    }

    #[test]
    fn test_migration_idempotent_on_fresh_db() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("biji.db")).unwrap();
        let conn = db.conn();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 3);
        // 空库:没有笔记可拆,块表存在即可
        let has_blocks = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'")
            .unwrap()
            .exists([])
            .unwrap();
        assert!(has_blocks);
    }

    #[test]
    fn test_blocks_foreign_key_cascade() {
        use crate::services::BlockService;
        use std::sync::Arc;
        let dir = tempfile::tempdir().unwrap();
        let db = Arc::new(Database::open(&dir.path().join("biji.db")).unwrap());
        let note = make_note();
        db.save_note(&note).unwrap();
        let svc = BlockService::new(db.clone());
        svc.sync_note_blocks(&note.id, "# 标题\n\n内容。").unwrap();
        assert_eq!(svc.get_note_blocks(&note.id).unwrap().len(), 2);
        // 永久删笔记 → 块级联删除
        db.delete_note(&note.id, true).unwrap();
        assert_eq!(svc.get_note_blocks(&note.id).unwrap().len(), 0);
    }
}
