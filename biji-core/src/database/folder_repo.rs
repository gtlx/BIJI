use crate::database::Database;
use crate::models::Folder;
use crate::utils::Error;

impl Database {
    /// 获取所有文件夹
    pub fn get_all_folders(&self, include_deleted: bool) -> Result<Vec<Folder>, Error> {
        let conn = self.conn();
        let mut sql = String::from("SELECT * FROM folders");
        if !include_deleted {
            sql.push_str(" WHERE deleted_at IS NULL");
        }
        sql.push_str(" ORDER BY name ASC");

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get("id")?,
                name: row.get("name")?,
                parent_id: row.get("parent_id")?,
                color: row.get("color")?,
                created_at: row.get("created_at")?,
                deleted_at: row.get("deleted_at")?,
            })
        })?;

        let mut folders = Vec::new();
        for row in rows {
            folders.push(row?);
        }
        Ok(folders)
    }

    /// 保存文件夹
    pub fn save_folder(&self, folder: &Folder) -> Result<(), Error> {
        let conn = self.conn();
        let now = chrono::Utc::now().timestamp_millis();

        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM folders WHERE id = ?1",
                rusqlite::params![folder.id],
                |row| row.get(0),
            )
            .ok();

        if existing.is_some() {
            conn.execute(
                "UPDATE folders SET name = ?1, parent_id = ?2, color = ?3, deleted_at = ?4
                 WHERE id = ?5",
                rusqlite::params![
                    folder.name,
                    folder.parent_id,
                    folder.color,
                    folder.deleted_at,
                    folder.id,
                ],
            )?;
        } else {
            conn.execute(
                "INSERT INTO folders (id, name, parent_id, color, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    folder.id,
                    folder.name,
                    folder.parent_id,
                    folder.color,
                    folder.created_at.max(now),
                ],
            )?;
        }
        Ok(())
    }

    /// 删除文件夹
    pub fn delete_folder(&self, id: &str, permanent: bool) -> Result<(), Error> {
        let conn = self.conn();
        // 先将该文件夹下的笔记设为无文件夹
        conn.execute(
            "UPDATE notes SET folder_id = NULL WHERE folder_id = ?1",
            rusqlite::params![id],
        )?;

        if permanent {
            conn.execute("DELETE FROM folders WHERE id = ?1", rusqlite::params![id])?;
        } else {
            conn.execute(
                "UPDATE folders SET deleted_at = ?1 WHERE id = ?2",
                rusqlite::params![chrono::Utc::now().timestamp_millis(), id],
            )?;
        }
        Ok(())
    }
}
