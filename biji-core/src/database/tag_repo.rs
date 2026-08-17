use crate::database::Database;
use crate::utils::Error;

impl Database {

    /// 批量加载笔记标签（替代 N+1 逐条查询）
    pub fn load_tags_for_notes(&self, notes: &mut [crate::models::Note]) -> Result<(), Error> {
        if notes.is_empty() {
            return Ok(());
        }
        let conn = self.conn();
        let placeholders: Vec<String> = notes.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT nt.note_id, t.name FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             WHERE nt.note_id IN ({})",
            placeholders.join(",")
        );
        let mut stmt = conn.prepare(&sql)?;
        let ids: Vec<String> = notes.iter().map(|n| n.id.clone()).collect();
        let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |row| {
            let note_id: String = row.get(0)?;
            let tag_name: String = row.get(1)?;
            Ok((note_id, tag_name))
        })?;
        let mut tag_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        for row in rows {
            let (note_id, tag_name) = row?;
            tag_map.entry(note_id).or_default().push(tag_name);
        }
        for note in notes.iter_mut() {
            if let Some(tags) = tag_map.remove(&note.id) {
                note.tags = tags;
            }
        }
        Ok(())
    }

    /// 获取笔记的标签列表
    pub fn get_note_tags(&self, note_id: &str) -> Result<Vec<String>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT t.name FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             WHERE nt.note_id = ?1",
        )?;

        let rows = stmt.query_map(rusqlite::params![note_id], |row| row.get::<_, String>(0))?;

        let mut tags = Vec::new();
        for row in rows {
            tags.push(row?);
        }
        Ok(tags)
    }

    /// 保存笔记的标签关联
    pub fn save_tags(&self, note_id: &str, tags: &[String]) -> Result<(), Error> {
        use crate::database::connection::with_transaction;
        let conn = self.conn();

        with_transaction(&conn, |tx| {
            // 删除旧关联
            tx.execute(
                "DELETE FROM note_tags WHERE note_id = ?1",
                rusqlite::params![note_id],
            )?;

            for tag in tags {
                let lower = tag.to_lowercase();
                // 插入标签（如果不存在）
                tx.execute(
                    "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)",
                    rusqlite::params![uuid::Uuid::new_v4().to_string(), lower],
                )?;
                // 关联笔记和标签
                tx.execute(
                    "INSERT INTO note_tags (note_id, tag_id)
                     VALUES (?1, (SELECT id FROM tags WHERE name = ?2))",
                    rusqlite::params![note_id, lower],
                )?;
            }
            Ok(())
        })?;

        Ok(())
    }

    /// [M3.5a 标签树] 列出全部标签及各标签笔记数(只统计未删除笔记)
    ///
    /// 侧栏「标签」区展开数据:按笔记数降序,便于一眼看出高频标签。
    pub fn get_all_tags(&self) -> Result<Vec<crate::models::TagCount>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT t.name, COUNT(*) FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             INNER JOIN notes n ON n.id = nt.note_id
             WHERE n.deleted_at IS NULL
             GROUP BY t.name
             ORDER BY COUNT(*) DESC, t.name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(crate::models::TagCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        })?;
        let mut tags = Vec::new();
        for row in rows {
            tags.push(row?);
        }
        Ok(tags)
    }

    /// [M3.5a 标签树] 按标签列出笔记
    ///
    /// 点击侧栏标签 → 过滤 NoteList 的后端支撑;标签名大小写不敏感(标签统一小写存储)。
    pub fn get_notes_by_tag(&self, tag: &str) -> Result<Vec<crate::models::Note>, Error> {
        let lower = tag.to_lowercase();
        let mut notes: Vec<crate::models::Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT n.* FROM notes n
                 INNER JOIN note_tags nt ON nt.note_id = n.id
                 INNER JOIN tags t ON t.id = nt.tag_id
                 WHERE t.name = ?1 AND n.deleted_at IS NULL
                 ORDER BY n.updated_at DESC",
            )?;
            let rows = stmt.query_map(rusqlite::params![lower], |row| {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Note, SyncStatus};

    fn open_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("biji.db")).unwrap();
        (dir, db)
    }

    fn make_note(id: &str, title: &str, tags: &[&str]) -> Note {
        Note {
            id: id.to_string(),
            title: title.to_string(),
            content: "内容".to_string(),
            folder_id: None,
            created_at: 1_000,
            updated_at: 2_000,
            tags: tags.iter().map(|s| s.to_string()).collect(),
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        }
    }

    /// [M3.5a] 标签树:get_all_tags 统计各标签笔记数(排除已删除)
    #[test]
    fn test_get_all_tags_counts() {
        let (_dir, db) = open_db();
        db.save_note(&make_note("n1", "甲", &["rust", "编程"])).unwrap();
        db.save_note(&make_note("n2", "乙", &["rust"])).unwrap();
        let n3 = make_note("n3", "丙", &["rust", "编程"]);
        db.save_note(&n3).unwrap();
        db.delete_note("n3", false).unwrap(); // 删除 n3,其标签不应计入

        let tags = db.get_all_tags().unwrap();
        // rust 只有 n1,n2 活跃(n3 已删)= 2;编程只有 n1 = 1
        let rust = tags.iter().find(|t| t.name == "rust").unwrap();
        assert_eq!(rust.count, 2);
        let coding = tags.iter().find(|t| t.name == "编程").unwrap();
        assert_eq!(coding.count, 1);
    }

    /// [M3.5a] 标签树:按标签列出笔记
    #[test]
    fn test_get_notes_by_tag_filters_notes() {
        let (_dir, db) = open_db();
        db.save_note(&make_note("n1", "Rust 笔记", &["rust"])).unwrap();
        db.save_note(&make_note("n2", "Python 笔记", &["python"])).unwrap();

        let hits = db.get_notes_by_tag("rust").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "Rust 笔记");
        // 大小写不敏感
        let hits = db.get_notes_by_tag("RUST").unwrap();
        assert_eq!(hits.len(), 1);

        let none = db.get_notes_by_tag("不存在").unwrap();
        assert!(none.is_empty());
    }
}
