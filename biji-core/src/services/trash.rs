use crate::database::Database;
use crate::models::Note;
use crate::utils::Error;
use std::sync::Arc;

/// [M3.5b 回收站] 回收站服务(业务层)
///
/// 组合 note/block 两边的软删存储:列出回收站中的笔记与块、恢复、彻底删除、清空。
/// 分层:model → storage(note_repo/block_repo))→ service(本节)→前端 adapter。
pub struct TrashService {
    db: Arc<Database>,
}

impl TrashService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// 回收站中的笔记(软删未彻底删,按删除时间倒序)
    pub fn get_trash_notes(&self) -> Result<Vec<Note>, Error> {
        self.db.get_trash_notes()
    }

    /// 回收站中的块(其笔记未被删;按删除时间倒序)
    pub fn get_trash_blocks(&self) -> Result<Vec<crate::models::TrashBlock>, Error> {
        self.db.get_trash_blocks()
    }

    /// 恢复一篇笔记(deleted_at 置 NULL,回到列表)
    pub fn restore_note(&self, id: &str) -> Result<(), Error> {
        self.db.restore_note(id)
    }

    /// 恢复一个块回原笔记
    pub fn restore_block(&self, id: &str) -> Result<(), Error> {
        self.db.restore_block(id)
    }

    /// 彻底删除一篇笔记(物理删行,块随 FK 级联删,历史保留)
    pub fn permanent_delete_note(&self, id: &str) -> Result<(), Error> {
        self.db.delete_note(id, true)
    }

    /// 彻底删除一个块(物理删行,历史保留)
    pub fn permanent_delete_block(&self, id: &str) -> Result<(), Error> {
        self.db.delete_block_row(id)
    }

    /// 清空整个回收站
    pub fn empty_trash(&self) -> Result<(), Error> {
        self.db.empty_trash()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Note, SyncStatus};

    fn open_service() -> (tempfile::TempDir, TrashService) {
        let dir = tempfile::tempdir().unwrap();
        let db = Arc::new(Database::open(&dir.path().join("biji.db")).unwrap());
        (dir, TrashService::new(db))
    }

    fn make_note(db: &Database, id: &str, title: &str) {
        db.save_note(&Note {
            id: id.to_string(),
            title: title.to_string(),
            content: "# 标题\n\n内容".into(),
            folder_id: None,
            created_at: 1_000,
            updated_at: 2_000,
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        })
        .unwrap();
    }

    #[test]
    fn test_note_trash_restore_permanent_empty() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        make_note(&db, "n1", "被删笔记");
        make_note(&db, "n2", "留存笔记");

        // 软删 n1 → 进回收站,n2 不在
        db.delete_note("n1", false).unwrap();
        let trash = svc.get_trash_notes().unwrap();
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].title, "被删笔记");
        // 正常列表不含 n1
        assert_eq!(db.get_all_notes(false).unwrap().len(), 1);

        // 恢复 n1
        svc.restore_note("n1").unwrap();
        assert!(svc.get_trash_notes().unwrap().is_empty());
        assert_eq!(db.get_all_notes(false).unwrap().len(), 2);

        // 再删后永久删除
        db.delete_note("n1", false).unwrap();
        svc.permanent_delete_note("n1").unwrap();
        assert!(svc.get_trash_notes().unwrap().is_empty());
        assert!(db.get_all_notes(true).unwrap().iter().all(|n| n.id != "n1"));
    }

    #[test]
    fn test_empty_trash_clears_everything() {
        let (_dir, svc) = open_service();
        let db = svc.db.clone();
        make_note(&db, "n1", "甲");
        make_note(&db, "n2", "乙");
        db.delete_note("n1", false).unwrap();
        db.delete_note("n2", false).unwrap();

        svc.empty_trash().unwrap();
        assert!(svc.get_trash_notes().unwrap().is_empty());
        assert!(db.get_all_notes(true).unwrap().is_empty());
    }
}
