use crate::database::Database;
use crate::models::NoteLink;
use crate::utils::{wikilink, Error};

impl Database {
    /// 保存笔记的 [[链接]] 关系
    pub fn save_links(&self, source_id: &str, content: &str) -> Result<(), Error> {
        let conn = self.conn();
        let now = chrono::Utc::now().timestamp_millis();

        // 删除旧的链接关系
        conn.execute(
            "DELETE FROM links WHERE source_id = ?1",
            rusqlite::params![source_id],
        )?;

        // 解析并插入新链接
        let targets = wikilink::parse_wikilinks(content);
        for target in targets {
            conn.execute(
                "INSERT INTO links (id, source_id, target_title, link_type, created_at)
                 VALUES (?1, ?2, ?3, 'wikilink', ?4)",
                rusqlite::params![uuid::Uuid::new_v4().to_string(), source_id, target, now,],
            )?;
        }
        Ok(())
    }

    /// 获取某笔记的反向链接（哪些笔记链接到它）
    pub fn get_backlinks(&self, note_id: &str) -> Result<Vec<crate::models::Note>, Error> {
        // 先获取笔记标题
        let note = match self.get_note(note_id)? {
            Some(n) => n,
            None => return Ok(Vec::new()),
        };

        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT n.* FROM notes n
             INNER JOIN links l ON n.id = l.source_id
             WHERE l.target_title = ?1 AND n.id != ?2 AND n.deleted_at IS NULL
             ORDER BY n.updated_at DESC",
        )?;

        let rows = stmt.query_map(rusqlite::params![note.title, note_id], |row| {
            Ok(crate::models::Note {
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

    /// 获取所有链接关系
    pub fn get_all_links(&self) -> Result<Vec<NoteLink>, Error> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT l.source_id, l.target_title, l.link_type
             FROM links l
             INNER JOIN notes s ON l.source_id = s.id
             WHERE s.deleted_at IS NULL",
        )?;

        let rows = stmt.query_map([], |row| {
            let source_id: String = row.get("source_id")?;
            let target_title: String = row.get("target_title")?;
            Ok((source_id, target_title))
        })?;

        let mut links = Vec::new();
        for row in rows {
            let (source_id, target_title) = row?;
            let source = self.get_note(&source_id)?.unwrap(); // 应有数据
            let target = self.find_note_by_title(&target_title)?;

            links.push(NoteLink {
                id: uuid::Uuid::new_v4().to_string(),
                source,
                target,
                target_title,
            });
        }
        Ok(links)
    }

    /// 按标题查找笔记
    pub fn find_note_by_title(&self, title: &str) -> Result<Option<crate::models::Note>, Error> {
        let conn = self.conn();
        let mut stmt =
            conn.prepare("SELECT * FROM notes WHERE title = ?1 AND deleted_at IS NULL")?;

        let mut rows = stmt.query_map(rusqlite::params![title], |row| {
            Ok(crate::models::Note {
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

        match rows.next() {
            Some(Ok(mut note)) => {
                note.tags = self.get_note_tags(&note.id)?;
                Ok(Some(note))
            }
            _ => Ok(None),
        }
    }

    /// 构建知识图谱数据
    pub fn get_graph_data(&self) -> Result<crate::models::GraphData, Error> {
        use crate::models::{GraphData, GraphEdge, GraphNode};
        use std::collections::HashMap;

        let notes = self.get_all_notes(false)?;
        let links = self.get_all_links()?;

        let mut node_map: HashMap<String, u32> = HashMap::new();

        // 统计每个节点的链接数
        for link in &links {
            *node_map.entry(link.source.id.clone()).or_insert(0) += 1;
            if let Some(ref target) = link.target {
                *node_map.entry(target.id.clone()).or_insert(0) += 1;
            }
        }

        let nodes: Vec<GraphNode> = notes
            .into_iter()
            .map(|n| {
                let node_id = n.id.clone();
                let count = node_map.get(&node_id).copied().unwrap_or(0);
                GraphNode {
                    id: node_id,
                    title: n.title,
                    link_count: count,
                }
            })
            .collect();

        let edges: Vec<GraphEdge> = links
            .into_iter()
            .filter_map(|l| {
                l.target.map(|t| GraphEdge {
                    source: l.source.id.clone(),
                    target: t.id.clone(),
                })
            })
            .collect();

        Ok(GraphData { nodes, edges })
    }
}
