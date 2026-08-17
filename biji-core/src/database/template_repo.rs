use crate::database::Database;
use crate::models::NoteTemplate;
use crate::utils::Error;

impl Database {
    /// [M3.5b 模板] 列出全部模板:内置在前(按 category),自定义按创建时间倒序
    pub fn list_templates(&self) -> Result<Vec<NoteTemplate>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, name, category, content, is_builtin, created_at FROM templates
             ORDER BY is_builtin DESC, category ASC, created_at DESC",
        )?;
        let rows = stmt.query_map([], template_from_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// [M3.5b 模板] 按 id 取单个模板
    pub fn get_template(&self, id: &str) -> Result<Option<NoteTemplate>, Error> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare("SELECT id, name, category, content, is_builtin, created_at FROM templates WHERE id = ?1")?;
        let mut rows = stmt.query_map(rusqlite::params![id], template_from_row)?;
        match rows.next() {
            Some(Ok(t)) => Ok(Some(t)),
            _ => Ok(None),
        }
    }

    /// [M3.5b 模板] 新增用户模板
    pub fn insert_template(&self, tpl: &NoteTemplate) -> Result<(), Error> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO templates (id, name, category, content, is_builtin, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                tpl.id,
                tpl.name,
                tpl.category,
                tpl.content,
                tpl.is_builtin as i32,
                tpl.created_at,
            ],
        )?;
        Ok(())
    }

    /// [M3.5b 模板] 更新用户模板内容(内置模板只读,过滤掉)
    pub fn update_template(&self, tpl: &NoteTemplate) -> Result<bool, Error> {
        let conn = self.conn();
        let n = conn.execute(
            "UPDATE templates SET name = ?1, category = ?2, content = ?3
             WHERE id = ?4 AND is_builtin = 0",
            rusqlite::params![tpl.name, tpl.category, tpl.content, tpl.id],
        )?;
        Ok(n > 0)
    }

    /// [M3.5b 模板] 删除用户模板(内置模板返回 false,不可删)
    pub fn delete_template(&self, id: &str) -> Result<bool, Error> {
        let conn = self.conn();
        let n = conn.execute(
            "DELETE FROM templates WHERE id = ?1 AND is_builtin = 0",
            rusqlite::params![id],
        )?;
        Ok(n > 0)
    }
}

/// 从行构建 NoteTemplate
pub(crate) fn template_from_row(row: &rusqlite::Row) -> rusqlite::Result<NoteTemplate> {
    Ok(NoteTemplate {
        id: row.get("id")?,
        name: row.get("name")?,
        category: row.get("category")?,
        content: row.get("content")?,
        is_builtin: row.get::<_, i32>("is_builtin")? != 0,
        created_at: row.get("created_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn open_db() -> (TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("biji.db")).unwrap();
        (dir, db)
    }

    fn user_tpl(name: &str) -> NoteTemplate {
        NoteTemplate {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            category: "custom".into(),
            content: format!("# {} 模板内容\n", name),
            is_builtin: false,
            created_at: chrono::Utc::now().timestamp_millis(),
        }
    }

    #[test]
    fn test_builtin_templates_seeded() {
        let (_dir, db) = open_db();
        let tpls = db.list_templates().unwrap();
        let names: Vec<&str> = tpls.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"空白笔记"));
        assert!(names.contains(&"日记"));
        assert!(names.contains(&"会议"));
        assert!(names.contains(&"读书"));
        // 全部内置
        assert!(tpls.iter().all(|t| t.is_builtin));
    }

    #[test]
    fn test_template_crud_custom_only() {
        let (_dir, db) = open_db();
        let tpl = user_tpl("周报");
        db.insert_template(&tpl).unwrap();
        let got = db.get_template(&tpl.id).unwrap().unwrap();
        assert_eq!(got.name, "周报");
        assert!(!got.is_builtin);

        // 更新用户模板生效
        let mut edited = tpl.clone();
        edited.content = "# 更新后的周报".into();
        assert!(db.update_template(&edited).unwrap());
        assert_eq!(db.get_template(&tpl.id).unwrap().unwrap().content, "# 更新后的周报");

        // 删除用户模板生效
        assert!(db.delete_template(&tpl.id).unwrap());
        assert!(db.get_template(&tpl.id).unwrap().is_none());
    }

    #[test]
    fn test_builtin_template_not_deletable() {
        let (_dir, db) = open_db();
        // 内置模板不可删、不可改
        assert!(!db.delete_template("diary").unwrap());
        let builtin = db.get_template("diary").unwrap().unwrap();
        let mut tried = builtin.clone();
        tried.content = "HACKED".into();
        assert!(!db.update_template(&tried).unwrap());
        assert_eq!(db.get_template("diary").unwrap().unwrap().content.contains("今日要点"), true);
    }
}
