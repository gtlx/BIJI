use crate::database::Database;
use crate::utils::Error;

impl Database {
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
}
