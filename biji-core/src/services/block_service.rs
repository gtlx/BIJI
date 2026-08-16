use crate::database::Database;
use crate::models::{Block, BlockHistory, ChangeType};
use crate::utils::blocks::{detect_block_type, split_markdown_blocks};
use crate::utils::Error;
use std::sync::Arc;
use uuid::Uuid;

/// 块服务(业务层)
///
/// 职责:块 CRUD 的业务规则(时间戳演变 + 历史快照 + 拆块/合并 diff)。
/// 存储层只做 SQL,本层决定"何时写历史、何时盖时间戳"。
///
/// 分层:model(类型)→ storage(block_repo)→ service(本模块)→ 前端 adapter。
pub struct BlockService {
    db: Arc<Database>,
}

impl BlockService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// 当前毫秒时间戳(块时间戳演变的时间源)
    fn now() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }

    // ==================== 块 CRUD ====================

    /// 新建块:类型由内容推断,created_at/updated_at 同时刻,排序追加到末尾
    pub fn create_block(
        &self,
        note_id: &str,
        content: &str,
        parent_id: Option<&str>,
    ) -> Result<Block, Error> {
        let ts = Self::now();
        let sort_order = self.db.count_note_blocks(note_id)?;
        let block = Block {
            id: Uuid::new_v4().to_string(),
            note_id: note_id.to_string(),
            parent_id: parent_id.map(|s| s.to_string()),
            block_type: detect_block_type(content),
            content: content.to_string(),
            created_at: ts,
            updated_at: ts,
            sort_order,
        };
        self.db.insert_block(&block)?;
        self.record_history(&block.id, &block.content, ChangeType::Create, ts)?;
        Ok(block)
    }

    /// 更新块内容:盖 updated_at + 写历史快照(快照 = 变更前内容)
    ///
    /// 整段替换 = 一个 update = 盖一个时间戳(PLAN.md 块粒度编辑的落地)。
    /// 内容未变化时不动时间戳、不写历史。
    pub fn update_block(&self, block_id: &str, new_content: &str) -> Result<Block, Error> {
        let old = self
            .db
            .get_block(block_id)?
            .ok_or_else(|| Error::NotFound(format!("block {block_id}")))?;

        if old.content == new_content {
            return Ok(old); // 内容未变:不盖时间戳、不写历史
        }

        let ts = Self::now();
        self.record_history(block_id, &old.content, ChangeType::Update, ts)?;
        self.db.update_block_content(block_id, new_content, ts)?;
        // 内容变化可能带来类型变化(如段落改成标题),类型与内容同源
        let updated = Block {
            block_type: detect_block_type(new_content),
            content: new_content.to_string(),
            updated_at: ts,
            ..old
        };
        let conn = self.db.conn();
        conn.execute(
            "UPDATE blocks SET type = ?1 WHERE id = ?2",
            rusqlite::params![updated.block_type.as_str(), block_id],
        )?;
        Ok(updated)
    }

    /// 删除块:先写 delete 历史快照(审计轨迹),再物理删除。
    ///
    /// 注:blocks 表暂未设软删字段(M3 回收站再做),历史快照即恢复保障;
    /// `permanent` 参数保留以对齐 API,当前两种取值行为一致。
    pub fn delete_block(&self, block_id: &str, _permanent: bool) -> Result<(), Error> {
        let block = self
            .db
            .get_block(block_id)?
            .ok_or_else(|| Error::NotFound(format!("block {block_id}")))?;
        let ts = Self::now();
        self.record_history(block_id, &block.content, ChangeType::Delete, ts)?;
        self.db.delete_block_row(block_id)?;
        Ok(())
    }

    /// 重排笔记内块顺序(按传入 id 顺序)
    pub fn reorder(&self, note_id: &str, ordered_ids: &[String]) -> Result<(), Error> {
        self.db.reorder_note_blocks(note_id, ordered_ids)
    }

    // ==================== 读取 ====================

    /// 笔记块序列(按 sort_order)
    pub fn get_note_blocks(&self, note_id: &str) -> Result<Vec<Block>, Error> {
        self.db.get_note_blocks(note_id)
    }

    /// 单块详情
    pub fn get_block(&self, block_id: &str) -> Result<Option<Block>, Error> {
        self.db.get_block(block_id)
    }

    /// 块历史时间线(新→旧)
    pub fn get_block_history(&self, block_id: &str) -> Result<Vec<BlockHistory>, Error> {
        self.db.get_block_history(block_id)
    }

    // ==================== 拆分/合并(保存时后端拆块) ====================

    /// 笔记内容 → 块序列同步(M2 核心)
    ///
    /// 前端整篇编辑保存时调用:按段落/标题拆块,与存量块做"位置对齐 diff":
    /// - 同位置内容相同 → 跳过(不动时间戳)
    /// - 同位置内容不同 → update + 历史快照(整段替换=一个 update,盖一个时间戳)
    /// - 新内容更多 → create
    /// - 存量更多 → delete(历史保留)
    ///
    /// 返回本次实际变更的块数。
    pub fn sync_note_blocks(&self, note_id: &str, content: &str) -> Result<usize, Error> {
        let drafts = split_markdown_blocks(content);
        let existing = self.db.get_note_blocks(note_id)?;
        let mut changed = 0usize;

        for (i, draft) in drafts.iter().enumerate() {
            match existing.get(i) {
                // 内容相同:不动时间戳、不写历史
                Some(block) if block.content == draft.content => continue,
                // 同位置内容变化:整段替换
                Some(block) => {
                    self.update_block(&block.id, &draft.content)?;
                    changed += 1;
                }
                // 新增块
                None => {
                    self.create_block(note_id, &draft.content, None)?;
                    changed += 1;
                }
            }
        }

        // 存量多余块(内容变短/删除段落):删除并保留历史
        for block in existing.iter().skip(drafts.len()) {
            self.delete_block(&block.id, true)?;
            changed += 1;
        }

        Ok(changed)
    }

    // ==================== 内部 ====================

    /// 写一条历史快照
    fn record_history(&self, block_id: &str, snapshot: &str, change_type: ChangeType, ts: i64) -> Result<(), Error> {
        let history = BlockHistory {
            id: Uuid::new_v4().to_string(),
            block_id: Some(block_id.to_string()),
            content_snapshot: snapshot.to_string(),
            changed_at: ts,
            change_type,
        };
        self.db.insert_block_history(&history)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::BlockType;
    use crate::models::Note;
    use crate::models::SyncStatus;
    use rusqlite::OptionalExtension;

    fn open_service() -> (tempfile::TempDir, BlockService) {
        let dir = tempfile::tempdir().unwrap();
        let db = Arc::new(Database::open(&dir.path().join("biji.db")).unwrap());
        (dir, BlockService::new(db))
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

    #[test]
    fn test_create_block_appends_and_records_create_history() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");

        let b1 = svc.create_block("n1", "第一段", None).unwrap();
        let b2 = svc.create_block("n1", "# 标题", None).unwrap();

        assert_eq!(b1.sort_order, 0);
        assert_eq!(b2.sort_order, 1);
        assert_eq!(b1.block_type, BlockType::Paragraph);
        assert_eq!(b2.block_type, BlockType::Heading);
        // create 历史
        let history = svc.get_block_history(&b1.id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].change_type, ChangeType::Create);
        assert_eq!(history[0].content_snapshot, "第一段");
    }

    #[test]
    fn test_update_block_stamps_timestamp_and_history() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        let b = svc.create_block("n1", "旧内容", None).unwrap();

        // 更新后:updated_at 被覆盖、created_at 不变
        std::thread::sleep(std::time::Duration::from_millis(5));
        let updated = svc.update_block(&b.id, "新内容").unwrap();
        assert_eq!(updated.content, "新内容");
        assert!(updated.updated_at > b.updated_at);
        assert_eq!(updated.created_at, b.created_at);

        // 历史快照 = 变更前内容
        let history = svc.get_block_history(&b.id).unwrap();
        assert_eq!(history.len(), 2); // create + update
        assert_eq!(history[0].change_type, ChangeType::Update);
        assert_eq!(history[0].content_snapshot, "旧内容");

        // 内容未变:不盖时间戳、不写历史
        let before = svc.get_block(&b.id).unwrap().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let same = svc.update_block(&b.id, "新内容").unwrap();
        assert_eq!(same.updated_at, before.updated_at);
        assert_eq!(svc.get_block_history(&b.id).unwrap().len(), 2);
    }

    #[test]
    fn test_delete_block_records_delete_history() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        let b = svc.create_block("n1", "要删除的内容", None).unwrap();

        svc.delete_block(&b.id, true).unwrap();
        assert!(svc.get_block(&b.id).unwrap().is_none());
        // 历史保留:block_id 置 NULL,内容快照仍在
        let conn = db.conn();
        let snap: String = conn
            .query_row("SELECT content_snapshot FROM block_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(snap, "要删除的内容");
        let orphan: Option<String> = conn
            .query_row("SELECT block_id FROM block_history", [], |r| r.get(0))
            .unwrap();
        assert!(orphan.is_none());
    }

    #[test]
    fn test_reorder_changes_sequence() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        let a = svc.create_block("n1", "A", None).unwrap();
        let b = svc.create_block("n1", "B", None).unwrap();
        let c = svc.create_block("n1", "C", None).unwrap();

        svc.reorder("n1", &[c.id.clone(), a.id.clone(), b.id.clone()])
            .unwrap();
        let blocks = svc.get_note_blocks("n1").unwrap();
        assert_eq!(
            blocks.iter().map(|x| x.content.as_str()).collect::<Vec<_>>(),
            vec!["C", "A", "B"]
        );
    }

    #[test]
    fn test_sync_note_blocks_initial_split() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        let content = "# 标题\n\n第一段。\n\n- 列表项\n\n> 引用行";
        let changed = svc.sync_note_blocks("n1", content).unwrap();
        assert_eq!(changed, 4);

        let blocks = svc.get_note_blocks("n1").unwrap();
        assert_eq!(blocks.len(), 4);
        assert_eq!(blocks[0].block_type, BlockType::Heading);
        assert_eq!(blocks[1].block_type, BlockType::Paragraph);
        assert_eq!(blocks[2].block_type, BlockType::ListItem);
        assert_eq!(blocks[3].block_type, BlockType::Quote);
        // 每块时间戳初值接近(毫秒级允许微小偏差)
        assert!((blocks[1].created_at - blocks[0].created_at).abs() < 5_000);
    }

    #[test]
    fn test_sync_note_blocks_position_diff() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        svc.sync_note_blocks("n1", "# 标题\n\n第一段。\n\n第二段。").unwrap();
        let before = svc.get_note_blocks("n1").unwrap();

        // 只改第二段:只有第 2 块被 update,块 id 稳定,第一段时间戳不动
        std::thread::sleep(std::time::Duration::from_millis(5));
        let changed = svc
            .sync_note_blocks("n1", "# 标题\n\n第一段。\n\n第二段(改过)。")
            .unwrap();
        assert_eq!(changed, 1);

        let after = svc.get_note_blocks("n1").unwrap();
        assert_eq!(after.len(), 3);
        assert_eq!(after[0].id, before[0].id); // 未变块 id 稳定
        assert_eq!(after[1].id, before[1].id);
        assert_eq!(after[2].id, before[2].id);
        assert_eq!(after[0].updated_at, before[0].updated_at); // 未变块时间戳不动
        assert!(after[2].updated_at > before[2].updated_at); // 变更块盖新时间戳
        assert_eq!(after[2].content, "第二段(改过)。");

        // 第二段历史:快照 = 旧内容
        let history = svc.get_block_history(&after[2].id).unwrap();
        assert_eq!(history[0].change_type, ChangeType::Update);
        assert_eq!(history[0].content_snapshot, "第二段。");
    }

    #[test]
    fn test_sync_note_blocks_delete_tail() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        svc.sync_note_blocks("n1", "# 标题\n\n第一段。\n\n第二段。").unwrap();
        let before = svc.get_note_blocks("n1").unwrap();

        // 删除尾部段落:尾部块被删,历史保留(块被硬删后 block_id 置 NULL,快照仍在)
        let changed = svc.sync_note_blocks("n1", "# 标题\n\n第一段。").unwrap();
        assert_eq!(changed, 1);
        let after = svc.get_note_blocks("n1").unwrap();
        assert_eq!(after.len(), 2);
        assert_eq!(after[0].id, before[0].id);

        // 被删块 id 已随块删除置 NULL,直接查历史表验证 delete 快照仍在
        let conn = db.conn();
        let snap: Option<String> = conn
            .query_row(
                "SELECT content_snapshot FROM block_history WHERE change_type = 'delete'",
                [],
                |r| r.get(0),
            )
            .optional()
            .unwrap();
        drop(conn);
        assert_eq!(snap.as_deref(), Some("第二段。"));
        // 存活块历史仍可通过 get_block_history 查:sync 建块会写 create 历史
        let history = svc.get_block_history(&after[1].id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].change_type, ChangeType::Create);
    }

    #[test]
    fn test_sync_note_blocks_no_change_is_noop() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        let content = "# 标题\n\n段落。";
        svc.sync_note_blocks("n1", content).unwrap();
        let changed = svc.sync_note_blocks("n1", content).unwrap();
        assert_eq!(changed, 0);
    }

    #[test]
    fn test_sync_note_blocks_appends_new_blocks() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        save_note(&db, "n1", "笔记", "");
        svc.sync_note_blocks("n1", "第一段。").unwrap();
        let changed = svc.sync_note_blocks("n1", "第一段。\n\n新增段落。").unwrap();
        assert_eq!(changed, 1);
        let blocks = svc.get_note_blocks("n1").unwrap();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[1].content, "新增段落。");
        assert_eq!(blocks[1].sort_order, 1);
    }
}
