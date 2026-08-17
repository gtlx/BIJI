use crate::database::Database;
use crate::models::{Block, BlockHistory, BlockSearchResult, ChangeType, Note};
use crate::utils::Error;

/// 从 SQLite 行构建 Block
pub(crate) fn block_from_row(row: &rusqlite::Row) -> rusqlite::Result<Block> {
    let block_type: String = row.get("type")?;
    Ok(Block {
        id: row.get("id")?,
        note_id: row.get("note_id")?,
        parent_id: row.get("parent_id")?,
        block_type: crate::models::BlockType::from_str(&block_type),
        content: row.get("content")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        sort_order: row.get("sort_order")?,
    })
}

impl Database {
    // ==================== 块 CRUD(存储层,纯 SQL) ====================

    /// 插入一个块
    pub fn insert_block(&self, block: &Block) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute(
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
        Ok(())
    }

    /// 更新块内容并盖 updated_at;返回是否真的发生了更新
    pub fn update_block_content(&self, block_id: &str, new_content: &str, ts: i64) -> Result<bool, Error> {
        let conn = self.conn();
        let changed = conn.execute(
            "UPDATE blocks SET content = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![new_content, ts, block_id],
        )?;
        Ok(changed > 0)
    }

    /// 硬删一个块(历史行保留,block_id 置 NULL)
    pub fn delete_block_row(&self, block_id: &str) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute("DELETE FROM blocks WHERE id = ?1", rusqlite::params![block_id])?;
        Ok(())
    }

    /// [M3.5b 回收站] 软删一个块：置 deleted_at(仍可读历史、可恢复到原笔记)
    pub fn soft_delete_block(&self, block_id: &str, ts: i64) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute(
            "UPDATE blocks SET deleted_at = ?1 WHERE id = ?2",
            rusqlite::params![ts, block_id],
        )?;
        Ok(())
    }

    /// [M3.5b 回收站] 恢复一个被软删的块(deleted_at 置 NULL,回到原笔记)
    pub fn restore_block(&self, block_id: &str) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute(
            "UPDATE blocks SET deleted_at = NULL WHERE id = ?1",
            rusqlite::params![block_id],
        )?;
        Ok(())
    }

    /// [M3.5b 回收站] 回收站中的块：块被软删且其笔记未被删(笔记若也在回收站则随笔记一并处理)
    ///
    /// 返回带笔记标题 + 删除时间的 TrashBlock 列表(按删除时间倒序)。
    pub fn get_trash_blocks(&self) -> Result<Vec<crate::models::TrashBlock>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT b.id, b.note_id, b.parent_id, b.type, b.content, b.created_at, b.updated_at,
                    b.sort_order, n.title AS note_title, b.deleted_at
             FROM blocks b
             INNER JOIN notes n ON b.note_id = n.id
             WHERE b.deleted_at IS NOT NULL AND n.deleted_at IS NULL
             ORDER BY b.deleted_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::models::TrashBlock {
                id: row.get("id")?,
                note_id: row.get("note_id")?,
                parent_id: row.get("parent_id")?,
                block_type: crate::models::BlockType::from_str(&row.get::<_, String>("type")?),
                content: row.get("content")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
                sort_order: row.get("sort_order")?,
                note_title: row.get("note_title")?,
                deleted_at: row.get("deleted_at")?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// 删除某笔记的全部块(笔记永久删除时级联会处理,此方法用于显式重建)
    pub fn delete_all_note_blocks(&self, note_id: &str) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute("DELETE FROM blocks WHERE note_id = ?1", rusqlite::params![note_id])?;
        Ok(())
    }

    /// 重排:按传入顺序覆盖 sort_order(事务内校验归属)
    pub fn reorder_note_blocks(&self, note_id: &str, ordered_ids: &[String]) -> Result<(), Error> {
        use crate::database::connection::with_transaction;
        let conn = self.conn();
        with_transaction(&conn, |tx| {
            for (order, id) in ordered_ids.iter().enumerate() {
                let n = tx.execute(
                    "UPDATE blocks SET sort_order = ?1 WHERE id = ?2 AND note_id = ?3",
                    rusqlite::params![order as i64, id, note_id],
                )?;
                if n == 0 {
                    return Err(rusqlite::Error::QueryReturnedNoRows);
                }
            }
            Ok(())
        })?;
        Ok(())
    }

    // ==================== 块读取 ====================

    /// 按 sort_order 返回笔记的块序列(含每块 created_at/updated_at;排除已删块)
    pub fn get_note_blocks(&self, note_id: &str) -> Result<Vec<Block>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT * FROM blocks WHERE note_id = ?1 AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![note_id], block_from_row)?;
        let mut blocks = Vec::new();
        for row in rows {
            blocks.push(row?);
        }
        Ok(blocks)
    }

    /// 根据 ID 获取单个块
    pub fn get_block(&self, block_id: &str) -> Result<Option<Block>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT * FROM blocks WHERE id = ?1 AND deleted_at IS NULL")?;
        let mut rows = stmt.query_map(rusqlite::params![block_id], block_from_row)?;
        match rows.next() {
            Some(Ok(b)) => Ok(Some(b)),
            _ => Ok(None),
        }
    }

    /// 统计某笔记的块数量
    pub fn count_note_blocks(&self, note_id: &str) -> Result<i64, Error> {
        let conn = self.conn();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM blocks WHERE note_id = ?1 AND deleted_at IS NULL",
            rusqlite::params![note_id],
            |row| row.get(0),
        )?;
        Ok(n)
    }

    /// [M3 演变视图] 按块创建时间返回笔记块序列(时间线重排的后端支撑)
    ///
    /// 展示「先写哪段后写哪段」:created_at 升序(同刻按 sort_order 兜底)。
    pub fn get_note_blocks_by_created(&self, note_id: &str) -> Result<Vec<Block>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT * FROM blocks WHERE note_id = ?1 AND deleted_at IS NULL ORDER BY created_at ASC, sort_order ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![note_id], block_from_row)?;
        let mut blocks = Vec::new();
        for row in rows {
            blocks.push(row?);
        }
        Ok(blocks)
    }

    // ==================== 块历史 ====================

    /// 插入一条历史快照
    pub fn insert_block_history(&self, history: &BlockHistory) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO block_history (id, block_id, content_snapshot, changed_at, change_type)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                history.id,
                history.block_id,
                history.content_snapshot,
                history.changed_at,
                history.change_type.as_str(),
            ],
        )?;
        Ok(())
    }

    /// 某块的全部历史(新→旧)
    pub fn get_block_history(&self, block_id: &str) -> Result<Vec<BlockHistory>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT * FROM block_history WHERE block_id = ?1 ORDER BY changed_at DESC, id ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![block_id], |row| {
            let change_type: String = row.get("change_type")?;
            Ok(BlockHistory {
                id: row.get("id")?,
                block_id: row.get("block_id")?,
                content_snapshot: row.get("content_snapshot")?,
                changed_at: row.get("changed_at")?,
                change_type: ChangeType::from_str(&change_type),
            })
        })?;
        let mut history = Vec::new();
        for row in rows {
            history.push(row?);
        }
        Ok(history)
    }

    // ==================== 双模式搜索(内容按块命中) ====================

    /// 标题模式:只匹配笔记标题(树过滤语义),返回笔记列表
    pub fn search_notes_by_title(&self, keyword: &str) -> Result<Vec<Note>, Error> {
        let pattern = format!("%{}%", keyword);
        let mut notes: Vec<Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT * FROM notes WHERE title LIKE ?1 AND deleted_at IS NULL ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map(rusqlite::params![pattern], |row| {
                crate::database::note_from_row(row)
            })?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row?);
            }
            out
        };
        self.load_tags_for_notes(&mut notes)?;
        Ok(notes)
    }

    /// 内容模式:按块命中,返回 命中块 + 所在笔记 id/标题 + 块内容片段
    ///
    /// 用 LIKE 匹配块内容(中文分词友好;FTS5 trigram 留作后续优化),
    /// 排除已删除笔记下的块,按块更新时间倒序。
    pub fn search_blocks(&self, keyword: &str) -> Result<Vec<BlockSearchResult>, Error> {
        let pattern = format!("%{}%", keyword);
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT b.id AS block_id, b.note_id, n.title AS note_title, b.content, b.updated_at
             FROM blocks b
             INNER JOIN notes n ON b.note_id = n.id
             WHERE b.content LIKE ?1 AND n.deleted_at IS NULL AND b.deleted_at IS NULL
             ORDER BY b.updated_at DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![pattern], |row| {
            Ok(BlockSearchResult {
                block_id: row.get("block_id")?,
                note_id: row.get("note_id")?,
                note_title: row.get("note_title")?,
                content: row.get("content")?,
                updated_at: row.get("updated_at")?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    // ==================== [M3.5a 日历热力图] ====================

    /// 毫秒时间戳 → 本地日 "YYYY-MM-DD"(与前端 CalendarView 色阶口径一致)
    fn millis_to_day(millis: i64) -> String {
        chrono::DateTime::from_timestamp_millis(millis)
            .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
            .unwrap_or_default()
    }

    /// 统计 [date_from, date_to](毫秒)内按日的块活跃
    ///
    /// 某块创建记入当日 created,更新记入当日 updated(排除已删除笔记下的块)。
    /// 返回按日升序的 BlockActivity 列表;无任何写入的日期不出现(前端按需补齐空天)。
    pub fn get_block_activity(&self, date_from: i64, date_to: i64) -> Result<Vec<crate::models::BlockActivity>, Error> {
        use std::collections::BTreeMap;
        let conn = self.conn();

        let mut created: BTreeMap<String, i64> = BTreeMap::new();
        let mut updated: BTreeMap<String, i64> = BTreeMap::new();

        {
            let mut stmt = conn.prepare(
                "SELECT b.created_at FROM blocks b
                 INNER JOIN notes n ON b.note_id = n.id
                 WHERE n.deleted_at IS NULL AND b.deleted_at IS NULL AND b.created_at BETWEEN ?1 AND ?2",
            )?;
            let rows = stmt.query_map(rusqlite::params![date_from, date_to], |r| r.get::<_, i64>(0))?;
            for row in rows {
                let ts = row?;
                *created.entry(Self::millis_to_day(ts)).or_insert(0) += 1;
            }
        }
        {
            let mut stmt = conn.prepare(
                "SELECT b.updated_at FROM blocks b
                 INNER JOIN notes n ON b.note_id = n.id
                 WHERE n.deleted_at IS NULL AND b.deleted_at IS NULL AND b.updated_at BETWEEN ?1 AND ?2",
            )?;
            let rows = stmt.query_map(rusqlite::params![date_from, date_to], |r| r.get::<_, i64>(0))?;
            for row in rows {
                let ts = row?;
                *updated.entry(Self::millis_to_day(ts)).or_insert(0) += 1;
            }
        }

        let mut merged: BTreeMap<String, crate::models::BlockActivity> = BTreeMap::new();
        for (d, c) in created {
            merged.entry(d.clone()).or_insert_with(|| crate::models::BlockActivity {
                date: d.clone(), created: 0, updated: 0,
            }).created = c;
        }
        for (d, u) in updated {
            merged.entry(d.clone()).or_insert_with(|| crate::models::BlockActivity {
                date: d.clone(), created: 0, updated: 0,
            }).updated = u;
        }
        Ok(merged.into_values().collect())
    }

    /// [M3.5a 日历] 取 [date_from, date_to] 内有写入的块(创建或更新)
    ///
    /// 供日历「点某天 → 显示当天写了哪些块」:含块片段 + 所在笔记标题 + 块时间戳。
    pub fn get_blocks_in_range(&self, date_from: i64, date_to: i64) -> Result<Vec<crate::models::BlockSearchResult>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT b.id AS block_id, b.note_id, n.title AS note_title, b.content, b.updated_at
             FROM blocks b
             INNER JOIN notes n ON b.note_id = n.id
             WHERE n.deleted_at IS NULL AND b.deleted_at IS NULL
               AND (b.created_at BETWEEN ?1 AND ?2 OR b.updated_at BETWEEN ?1 AND ?2)
             ORDER BY b.updated_at DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![date_from, date_to], |row| {
            Ok(crate::models::BlockSearchResult {
                block_id: row.get("block_id")?,
                note_id: row.get("note_id")?,
                note_title: row.get("note_title")?,
                content: row.get("content")?,
                updated_at: row.get("updated_at")?,
            })
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BlockType, SyncStatus};
    use uuid::Uuid;

    fn open_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("biji.db")).unwrap();
        (dir, db)
    }

    fn save_note(db: &Database, id: &str, title: &str, content: &str) {
        let note = Note {
            id: id.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            folder_id: None,
            created_at: 1_000,
            updated_at: 2_000,
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        };
        db.save_note(&note).unwrap();
    }

    fn make_block(note_id: &str, content: &str, order: i64, ts: i64) -> Block {
        Block {
            id: Uuid::new_v4().to_string(),
            note_id: note_id.to_string(),
            parent_id: None,
            block_type: BlockType::Paragraph,
            content: content.to_string(),
            created_at: ts,
            updated_at: ts,
            sort_order: order,
        }
    }

    /// 存笔记 + 按拆块规则生成其块(存储层搜索测试需要块数据存在)
    fn save_note_with_blocks(db: &Database, id: &str, title: &str, content: &str) {
        save_note(db, id, title, content);
        let drafts = crate::utils::blocks::split_markdown_blocks(content);
        for (i, d) in drafts.iter().enumerate() {
            db.insert_block(&make_block(id, &d.content, i as i64, 2_000 + i as i64))
                .unwrap();
        }
    }

    #[test]
    fn test_insert_and_get_note_blocks() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        db.insert_block(&make_block("n1", "第一块", 0, 100)).unwrap();
        db.insert_block(&make_block("n1", "第二块", 1, 101)).unwrap();

        let blocks = db.get_note_blocks("n1").unwrap();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].content, "第一块");
        assert_eq!(blocks[0].sort_order, 0);
        assert_eq!(blocks[1].content, "第二块");
        assert_eq!(db.count_note_blocks("n1").unwrap(), 2);
    }

    #[test]
    fn test_update_block_content_stamps_timestamp() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        let block = make_block("n1", "旧内容", 0, 100);
        db.insert_block(&block).unwrap();

        let changed = db.update_block_content(&block.id, "新内容", 999).unwrap();
        assert!(changed);
        let updated = db.get_block(&block.id).unwrap().unwrap();
        assert_eq!(updated.content, "新内容");
        assert_eq!(updated.updated_at, 999);
        // created_at 不被覆盖
        assert_eq!(updated.created_at, 100);

        // 不存在的块返回 false
        let changed = db.update_block_content("no-such", "x", 999).unwrap();
        assert!(!changed);
    }

    #[test]
    fn test_delete_block_row_and_history_survives() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        let block = make_block("n1", "将被删除", 0, 100);
        db.insert_block(&block).unwrap();
        db.insert_block_history(&BlockHistory {
            id: Uuid::new_v4().to_string(),
            block_id: Some(block.id.clone()),
            content_snapshot: "将被删除".into(),
            changed_at: 100,
            change_type: ChangeType::Create,
        })
        .unwrap();

        db.delete_block_row(&block.id).unwrap();
        assert!(db.get_block(&block.id).unwrap().is_none());
        // 历史行保留(block_id 置 NULL),审计轨迹不丢
        let conn = db.conn();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM block_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let orphan: Option<String> = conn
            .query_row("SELECT block_id FROM block_history", [], |r| r.get(0))
            .unwrap();
        assert!(orphan.is_none());
    }

    #[test]
    fn test_reorder_note_blocks() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        let b1 = make_block("n1", "A", 0, 100);
        let b2 = make_block("n1", "B", 1, 101);
        let b3 = make_block("n1", "C", 2, 102);
        db.insert_block(&b1).unwrap();
        db.insert_block(&b2).unwrap();
        db.insert_block(&b3).unwrap();

        // 倒序重排:B, A, C
        db.reorder_note_blocks("n1", &[b2.id.clone(), b1.id.clone(), b3.id.clone()])
            .unwrap();
        let blocks = db.get_note_blocks("n1").unwrap();
        assert_eq!(
            blocks.iter().map(|b| b.content.as_str()).collect::<Vec<_>>(),
            vec!["B", "A", "C"]
        );

        // 传入不属于该笔记的块 id → 报错且整体回滚
        let bad = db.reorder_note_blocks("n1", &[b1.id.clone(), "foreign".into()]);
        assert!(bad.is_err());
        let blocks = db.get_note_blocks("n1").unwrap();
        assert_eq!(blocks[0].sort_order, 0); // 事务回滚,顺序不变
    }

    #[test]
    fn test_search_notes_by_title() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "购物清单", "内容一");
        save_note(&db, "n2", "工作日志", "内容二");
        save_note(&db, "n3", "购物心得", "内容三");

        let hits = db.search_notes_by_title("购物").unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().all(|n| n.title.contains("购物")));
        // 标题无关的正文命中不应出现在标题模式
        let hits = db.search_notes_by_title("内容一").unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn test_search_blocks_by_content() {
        let (_dir, db) = open_db();
        save_note_with_blocks(&db, "n1", "笔记A", "# 标题\n\n段落甲,包含关键词。");
        save_note_with_blocks(&db, "n2", "笔记B", "# 其他\n\n段落乙,无关内容。\n\n段落丙,也有关键词!");

        let results = db.search_blocks("关键词").unwrap();
        assert_eq!(results.len(), 2);
        // 按块命中:每块一条
        assert!(results.iter().all(|r| r.content.contains("关键词")));
        assert!(results.iter().any(|r| r.note_id == "n1"));
        assert!(results.iter().any(|r| r.note_id == "n2"));
        // 含笔记标题
        let r = results.iter().find(|r| r.note_id == "n1").unwrap();
        assert_eq!(r.note_title, "笔记A");
    }

    #[test]
    fn test_search_blocks_excludes_deleted_notes() {
        let (_dir, db) = open_db();
        save_note_with_blocks(&db, "n1", "活着", "包含隐藏词的内容");
        save_note_with_blocks(&db, "n2", "删除的", "包含隐藏词的内容");
        db.delete_note("n2", false).unwrap();

        let results = db.search_blocks("隐藏词").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].note_id, "n1");
    }

    /// [M3] 演变视图:按创建时间排序返回块(时间线重排后端支撑)
    #[test]
    fn test_get_note_blocks_by_created_timeline() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        // 打乱 sort_order,created_at 明确区分
        let b1 = make_block("n1", "先写", 2, 100);
        let b2 = make_block("n1", "后写", 0, 200);
        let b3 = make_block("n1", "最后写", 1, 300);
        db.insert_block(&b1).unwrap();
        db.insert_block(&b2).unwrap();
        db.insert_block(&b3).unwrap();

        let timeline = db.get_note_blocks_by_created("n1").unwrap();
        let contents: Vec<&str> = timeline.iter().map(|b| b.content.as_str()).collect();
        assert_eq!(contents, vec!["先写", "后写", "最后写"]);
    }

    #[test]
    fn test_get_block_history_order_newest_first() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        let block = make_block("n1", "v1", 0, 100);
        db.insert_block(&block).unwrap();

        for (i, snap) in ["v1", "v2", "v3"].iter().enumerate() {
            db.insert_block_history(&BlockHistory {
                id: Uuid::new_v4().to_string(),
                block_id: Some(block.id.clone()),
                content_snapshot: snap.to_string(),
                changed_at: 100 + i as i64,
                change_type: ChangeType::Update,
            })
            .unwrap();
        }
        let history = db.get_block_history(&block.id).unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].content_snapshot, "v3");
        assert_eq!(history[2].content_snapshot, "v1");
    }

    /// [M3.5a] 日历热力图:按日统计 created/updated 块数
    #[test]
    fn test_get_block_activity_groups_by_day() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        // 固定基准毫秒(UTC 2023-11-14 05:33 UTC)
        let day = 1_700_000_000_000i64;
        let day_start = day - 4 * 3600_000; // 按本地时区确保落入同一天(取当天首尾)
        let day_end = day_start + 24 * 3600_000;
        // 3 块当日创建;把初始 updated_at 挪到前一天(不计入本日 updated)
        let b1 = make_block("n1", "A", 0, day_start + 100);
        let b2 = make_block("n1", "B", 1, day_start + 200);
        let b3 = make_block("n1", "C", 2, day_start + 300);
        db.insert_block(&b1).unwrap();
        db.insert_block(&b2).unwrap();
        db.insert_block(&b3).unwrap();
        for id in [&b1.id, &b2.id, &b3.id] {
            db.conn().execute(
                "UPDATE blocks SET updated_at = ?1 WHERE id = ?2",
                rusqlite::params![day_start - 86400_000, id],
            ).unwrap();
        }
        // 当日只更新其中的 2 块
        db.update_block_content(&b1.id, "A2", day_start + 500).unwrap();
        db.update_block_content(&b2.id, "B2", day_start + 600).unwrap();

        let activity = db.get_block_activity(day_start, day_end).unwrap();
        assert_eq!(activity.len(), 1, "应正好一个日期条目: {:?}", activity);
        assert_eq!(activity[0].created, 3, "当日创建 3 块");
        assert_eq!(activity[0].updated, 2, "当日只更新 2 块");
        // date 形如 YYYY-MM-DD
        let parts: Vec<&str> = activity[0].date.split('-').collect();
        assert_eq!(parts.len(), 3);
    }

    /// [M3.5a] 日历:范围外块不计入;已删除笔记下的块不计入
    #[test]
    fn test_get_block_activity_respects_range_and_deleted() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记", "内容");
        save_note(&db, "n2", "删除的", "内容");
        let day1 = 1_700_000_000_000i64;
        let day2 = day1 + 86400_000;
        db.insert_block(&make_block("n1", "天1", 0, day1)).unwrap();
        db.insert_block(&make_block("n2", "删除", 0, day2)).unwrap();
        db.delete_note("n2", false).unwrap();

        let activity = db.get_block_activity(day1, day1 + 86400_000).unwrap();
        assert_eq!(activity.len(), 1);
        assert_eq!(activity[0].created, 1);
    }

    /// [M3.5a] 日历:点天取当天写入的块(片段 + 笔记标题)
    #[test]
    fn test_get_blocks_in_range_returns_day_blocks() {
        let (_dir, db) = open_db();
        save_note(&db, "n1", "笔记A", "内容");
        save_note(&db, "n2", "笔记B", "内容");
        let day = 1_700_000_000_000i64;
        db.insert_block(&make_block("n1", "早上的块", 0, day + 100)).unwrap();
        db.insert_block(&make_block("n2", "晚上的块", 0, day + 600)).unwrap();

        let day_start = day - 4 * 3600_000;
        let day_end = day_start + 24 * 3600_000;
        let blocks = db.get_blocks_in_range(day_start, day_end).unwrap();
        assert_eq!(blocks.len(), 2);
        // 按 updated_at 降序:晚上在前
        assert_eq!(blocks[0].content, "晚上的块");
        assert_eq!(blocks[0].note_title, "笔记B");

        // 空范围返回空
        let empty = db.get_blocks_in_range(day + 9000_000, day + 9000_000).unwrap();
        assert!(empty.is_empty());
    }
}
