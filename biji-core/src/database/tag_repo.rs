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
}
