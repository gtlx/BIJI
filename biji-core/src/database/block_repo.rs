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

    /// 按 sort_order 返回笔记的块序列(含每块 created_at/updated_at)
    pub fn get_note_blocks(&self, note_id: &str) -> Result<Vec<Block>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT * FROM blocks WHERE note_id = ?1 ORDER BY sort_order ASC, created_at ASC",
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
        let mut stmt = conn.prepare("SELECT * FROM blocks WHERE id = ?1")?;
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
            "SELECT COUNT(*) FROM blocks WHERE note_id = ?1",
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
            "SELECT * FROM blocks WHERE note_id = ?1 ORDER BY created_at ASC, sort_order ASC",
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
             WHERE b.content LIKE ?1 AND n.deleted_at IS NULL
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
}
