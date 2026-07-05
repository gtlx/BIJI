use crate::database::Database;
use crate::models::note::SyncStatus;
use crate::models::{Note, SearchQuery};
use crate::utils::Error;

impl Database {
    fn sync_status_str(status: &SyncStatus) -> &'static str {
        match status {
            SyncStatus::Synced => "synced",
            SyncStatus::Pending => "pending",
            SyncStatus::Conflict => "conflict",
        }
    }

    /// 获取所有笔记（默认不含已删除）
    pub fn get_all_notes(&self, include_deleted: bool) -> Result<Vec<Note>, Error> {
        let mut sql = String::from("SELECT * FROM notes");
        if !include_deleted {
            sql.push_str(" WHERE deleted_at IS NULL");
        }
        sql.push_str(" ORDER BY updated_at DESC");

        let mut notes: Vec<Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], |row| crate::database::note_from_row(row))?;
            let mut notes: Vec<Note> = Vec::new();
            for row in rows {
                notes.push(row?);
            }
            notes
        };

        self.load_tags_for_notes(&mut notes)?;
        Ok(notes)
    }

    /// 根据 ID 获取单个笔记
    pub fn get_note(&self, id: &str) -> Result<Option<Note>, Error> {
        let mut note: Option<Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare("SELECT * FROM notes WHERE id = ?1 AND deleted_at IS NULL")?;
            let mut rows = stmt.query_map(rusqlite::params![id], |row| {
                crate::database::note_from_row(row)
            })?;
            match rows.next() {
                Some(Ok(n)) => Ok::<Option<Note>, crate::utils::Error>(Some(n)),
                _ => Ok(None),
            }
        }?;

        if let Some(ref mut n) = note {
            n.tags = self.get_note_tags(id)?;
        }
        Ok(note)
    }

    /// 保存笔记（新建或更新）
    pub fn save_note(&self, note: &Note) -> Result<(), Error> {
        use crate::database::connection::with_transaction;
        {
            let conn = self.conn();
            with_transaction(&conn, |tx| {
                let now = chrono::Utc::now().timestamp_millis();
                let existing: Option<String> = tx
                    .query_row(
                        "SELECT id FROM notes WHERE id = ?1",
                        rusqlite::params![note.id],
                        |row| row.get(0),
                    )
                    .ok();

                if existing.is_some() {
                    tx.execute(
                        "UPDATE notes SET title = ?1, content = ?2, folder_id = ?3,
                         updated_at = ?4, is_encrypted = ?5, sync_status = ?6, deleted_at = ?7
                         WHERE id = ?8",
                        rusqlite::params![
                            note.title,
                            note.content,
                            note.folder_id,
                            note.updated_at.max(now),
                            note.is_encrypted as i32,
                            Self::sync_status_str(&note.sync_status),
                            note.deleted_at,
                            note.id,
                        ],
                    )?;
                } else {
                    tx.execute(
                        "INSERT INTO notes (id, title, content, folder_id, created_at, updated_at, is_encrypted, sync_status)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        rusqlite::params![
                            note.id,
                            note.title,
                            note.content,
                            note.folder_id,
                            note.created_at.max(now),
                            note.updated_at.max(now),
                            note.is_encrypted as i32,
                            Self::sync_status_str(&note.sync_status),
                        ],
                    )?;
                }

                Ok(())
            })?;
        }

        self.save_links(&note.id, &note.content)?;
        self.save_tags(&note.id, &note.tags)?;

        Ok(())
    }

    /// 删除笔记（软删除）
    pub fn delete_note(&self, id: &str, permanent: bool) -> Result<(), Error> {
        let conn = self.conn();
        if permanent {
            conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])?;
        } else {
            conn.execute(
                "UPDATE notes SET deleted_at = ?1, sync_status = 'pending' WHERE id = ?2",
                rusqlite::params![chrono::Utc::now().timestamp_millis(), id],
            )?;
        }
        Ok(())
    }

    /// 恢复已删除的笔记
    pub fn restore_note(&self, id: &str) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute(
            "UPDATE notes SET deleted_at = NULL WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    }

    /// 搜索笔记
    pub fn search_notes(&self, query: &SearchQuery) -> Result<Vec<Note>, Error> {
        let mut sql = String::from("SELECT DISTINCT n.* FROM notes n");
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut conditions: Vec<String> = vec!["n.deleted_at IS NULL".into()];

        if let Some(ref tags) = query.tags {
            if !tags.is_empty() {
                sql.push_str(" INNER JOIN note_tags nt ON n.id = nt.note_id");
                sql.push_str(" INNER JOIN tags t ON nt.tag_id = t.id");
                let placeholders: Vec<String> = tags.iter().map(|_| "?".to_string()).collect();
                conditions.push(format!("t.name IN ({})", placeholders.join(",")));
                for tag in tags {
                    params.push(Box::new(tag.to_lowercase()));
                }
            }
        }

        if let Some(ref keyword) = query.keyword {
            conditions.push("(n.title LIKE ? OR n.content LIKE ?)".into());
            let pattern = format!("%{}%", keyword);
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
        }

        if let Some(ref folder_id) = query.folder_id {
            conditions.push("n.folder_id = ?".into());
            params.push(Box::new(folder_id.clone()));
        }

        if let Some(date_from) = query.date_from {
            conditions.push("n.updated_at >= ?".into());
            params.push(Box::new(date_from));
        }
        if let Some(date_to) = query.date_to {
            conditions.push("n.updated_at <= ?".into());
            params.push(Box::new(date_to));
        }

        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
        sql.push_str(" ORDER BY n.updated_at DESC");

        let mut notes_out: Vec<Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(&sql)?;
            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();
            let rows = stmt.query_map(param_refs.as_slice(), |row| {
                crate::database::note_from_row(row)
            })?;
            let mut notes = Vec::new();
            for row in rows {
                notes.push(row?);
            }
            notes
        };

        self.load_tags_for_notes(&mut notes_out)?;
        Ok(notes_out)
    }

    /// 获取待同步笔记
    pub fn get_pending_sync_notes(&self) -> Result<Vec<Note>, Error> {
        let mut notes: Vec<Note> = {
            let conn = self.conn();
            let mut stmt = conn
                .prepare("SELECT * FROM notes WHERE sync_status = 'pending' AND deleted_at IS NULL")?;
            let rows = stmt.query_map([], |row| crate::database::note_from_row(row))?;
            let mut notes = Vec::new();
            for row in rows {
                notes.push(row?);
            }
            notes
        };

        self.load_tags_for_notes(&mut notes)?;
        Ok(notes)
    }

    /// 标记笔记为已同步
    pub fn mark_synced(&self, note_ids: &[String]) -> Result<(), Error> {
        if note_ids.is_empty() {
            return Ok(());
        }
        let placeholders: Vec<String> = note_ids.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "UPDATE notes SET sync_status = 'synced' WHERE id IN ({})",
            placeholders.join(",")
        );
        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            note_ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
        stmt.execute(param_refs.as_slice())?;
        Ok(())
    }
}
