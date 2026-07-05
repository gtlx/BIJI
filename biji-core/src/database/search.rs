use crate::database::Database;
use crate::models::Note;
use crate::utils::Error;

impl Database {
    /// 使用 FTS5 进行全文搜索（需要先启用 FTS5 表）
    /// 当前兜底方案是用 LIKE，后续可启用 FTS5
    pub fn fulltext_search(&self, keyword: &str) -> Result<Vec<Note>, Error> {
        let conn = self.conn();
        let has_fts = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'")
            .and_then(|mut stmt| stmt.exists([]))
            .unwrap_or(false);
        drop(conn);

        if has_fts {
            let mut notes: Vec<Note> = {
                let conn = self.conn();
                let mut stmt = conn.prepare(
                    "SELECT n.* FROM notes n
                     INNER JOIN notes_fts fts ON n.rowid = fts.rowid
                     WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
                     ORDER BY rank",
                )?;

                let rows = stmt.query_map(rusqlite::params![keyword], |row| {
                    crate::database::note_from_row(row)
                })?;

                let mut notes = Vec::new();
                for row in rows {
                    notes.push(row?);
                }
                notes
            };
            self.load_tags_for_notes(&mut notes)?;
            return Ok(notes);
        }

        let pattern = format!("%{}%", keyword);
        let mut notes: Vec<Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT * FROM notes
                 WHERE (title LIKE ?1 OR content LIKE ?1) AND deleted_at IS NULL
                 ORDER BY updated_at DESC",
            )?;

            let rows = stmt.query_map(rusqlite::params![pattern], |row| {
                crate::database::note_from_row(row)
            })?;

            let mut notes = Vec::new();
            for row in rows {
                notes.push(row?);
            }
            notes
        };
        self.load_tags_for_notes(&mut notes)?;
        Ok(notes)
    }
}
