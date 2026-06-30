use crate::database::Database;
use crate::models::Note;
use crate::utils::Error;

impl Database {
    /// 使用 FTS5 进行全文搜索（需要先启用 FTS5 表）
    /// 当前兜底方案是用 LIKE，后续可启用 FTS5
    pub fn fulltext_search(&self, keyword: &str) -> Result<Vec<Note>, Error> {
        // 尝试使用 FTS5（如果表存在）
        let conn = self.conn();
        let has_fts = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'")
            .and_then(|mut stmt| stmt.exists([]))
            .unwrap_or(false);

        if has_fts {
            let mut stmt = conn.prepare(
                "SELECT n.* FROM notes n
                 INNER JOIN notes_fts fts ON n.rowid = fts.rowid
                 WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
                 ORDER BY rank",
            )?;

            let rows = stmt.query_map(rusqlite::params![keyword], |row| {
                Ok(Note {
                    id: row.get("id")?,
                    title: row.get("title")?,
                    content: row.get("content")?,
                    folder_id: row.get("folder_id")?,
                    created_at: row.get("created_at")?,
                    updated_at: row.get("updated_at")?,
                    is_encrypted: row.get::<_, i32>("is_encrypted")? != 0,
                    sync_status: crate::models::note::SyncStatus::Synced,
                    deleted_at: row.get("deleted_at")?,
                    tags: Vec::new(),
                    frontmatter: None,
                })
            })?;

            let mut notes = Vec::new();
            for row in rows {
                let mut note = row?;
                note.tags = self.get_note_tags(&note.id)?;
                notes.push(note);
            }
            return Ok(notes);
        }

        // 降级方案：LIKE 模糊搜索
        let pattern = format!("%{}%", keyword);
        let mut stmt = conn.prepare(
            "SELECT * FROM notes
             WHERE (title LIKE ?1 OR content LIKE ?1) AND deleted_at IS NULL
             ORDER BY updated_at DESC",
        )?;

        let rows = stmt.query_map(rusqlite::params![pattern], |row| {
            Ok(Note {
                id: row.get("id")?,
                title: row.get("title")?,
                content: row.get("content")?,
                folder_id: row.get("folder_id")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
                is_encrypted: row.get::<_, i32>("is_encrypted")? != 0,
                sync_status: crate::models::note::SyncStatus::Synced,
                deleted_at: row.get("deleted_at")?,
                tags: Vec::new(),
                frontmatter: None,
            })
        })?;

        let mut notes = Vec::new();
        for row in rows {
            let mut note = row?;
            note.tags = self.get_note_tags(&note.id)?;
            notes.push(note);
        }
        Ok(notes)
    }
}
