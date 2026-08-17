use crate::database::Database;
use crate::models::Folder;
use crate::utils::Error;

/// 从 SQLite 行构建 Folder
pub(crate) fn folder_from_row(row: &rusqlite::Row) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: row.get("id")?,
        name: row.get("name")?,
        parent_id: row.get("parent_id")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

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

    // ==================== M3 嵌套文件夹查询 ====================

    /// 按 ID 获取单个文件夹
    pub fn get_folder(&self, id: &str) -> Result<Option<Folder>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT * FROM folders WHERE id = ?1")?;
        let mut rows = stmt.query_map(rusqlite::params![id], folder_from_row)?;
        match rows.next() {
            Some(Ok(f)) => Ok(Some(f)),
            _ => Ok(None),
        }
    }

    /// 某文件夹的直接子文件夹(不含已删除)
    pub fn get_folder_children(&self, parent_id: Option<&str>) -> Result<Vec<Folder>, Error> {
        let sql = match parent_id {
            Some(_) => "SELECT * FROM folders WHERE parent_id = ?1 AND deleted_at IS NULL ORDER BY name ASC",
            None => "SELECT * FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY name ASC",
        };
        let conn = self.conn();
        let mut stmt = conn.prepare(sql)?;
        let rows = match parent_id {
            Some(pid) => stmt.query_map(rusqlite::params![pid], folder_from_row)?,
            None => stmt.query_map([], folder_from_row)?,
        };
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// 解析文件夹到根的完整路径(返回根→叶,用于编辑器顶部面包屑)
    ///
    /// 一路向上追 parent_id 直到根,再反转得根→叶顺序。无该 id 返回空。
    pub fn resolve_folder_path(&self, id: &str) -> Result<Vec<Folder>, Error> {
        let mut path = Vec::new();
        let mut current = self.get_folder(id)?;
        while let Some(f) = current {
            let pid = f.parent_id.clone();
            path.push(f);
            current = match pid {
                Some(pid) => self.get_folder(&pid)?,
                None => None,
            };
        }
        path.reverse();
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("biji.db")).unwrap();
        (dir, db)
    }

    fn make_folder(id: &str, name: &str, parent: Option<&str>) -> Folder {
        Folder {
            id: id.to_string(),
            name: name.to_string(),
            parent_id: parent.map(|s| s.to_string()),
            created_at: 1_000,
            color: None,
            deleted_at: None,
        }
    }

    /// M3:嵌套文件夹 CRUD + 路径解析
    #[test]
    fn test_nested_folder_crud_and_path() {
        let (_dir, db) = open_db();
        let f1 = make_folder("f1", "项目", None);
        let f2 = make_folder("f2", "BIJI", Some("f1"));
        let f3 = make_folder("f3", "文档", Some("f2"));
        for f in [&f1, &f2, &f3] {
            db.save_folder(f).unwrap();
        }

        // 嵌套 CRUD:get_folder 能取到嵌套子级
        let got = db.get_folder("f3").unwrap().unwrap();
        assert_eq!(got.parent_id.as_deref(), Some("f2"));

        // 路径解析:根→叶
        let path = db.resolve_folder_path("f3").unwrap();
        let names: Vec<&str> = path.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["项目", "BIJI", "文档"]);

        // 子文件夹查询
        let children = db.get_folder_children(Some("f1")).unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].id, "f2");
        let roots = db.get_folder_children(None).unwrap();
        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].id, "f1");
    }

    /// M3:嵌套文件夹删除后 get_folder 返回 None
    #[test]
    fn test_nested_folder_delete() {
        let (_dir, db) = open_db();
        let f1 = make_folder("f1", "项目", None);
        let f2 = make_folder("f2", "BIJI", Some("f1"));
        db.save_folder(&f1).unwrap();
        db.save_folder(&f2).unwrap();

        db.delete_folder("f2", true).unwrap();
        assert!(db.get_folder("f2").unwrap().is_none());
        // 不存在 id:路径为空
        assert!(db.resolve_folder_path("no-such").unwrap().is_empty());
    }
}