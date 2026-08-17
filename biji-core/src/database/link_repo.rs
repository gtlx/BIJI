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

        let mut notes: Vec<crate::models::Note> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT n.* FROM notes n
                 INNER JOIN links l ON n.id = l.source_id
                 WHERE l.target_title = ?1 AND n.id != ?2 AND n.deleted_at IS NULL
                 ORDER BY n.updated_at DESC",
            )?;

            let rows = stmt.query_map(rusqlite::params![note.title, note_id], |row| {
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

    /// 获取所有链接关系
    pub fn get_all_links(&self) -> Result<Vec<NoteLink>, Error> {
        let raw_links: Vec<(String, String, String)> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT l.id, l.source_id, l.target_title
                 FROM links l
                 INNER JOIN notes s ON l.source_id = s.id
                 WHERE s.deleted_at IS NULL",
            )?;

            let rows = stmt.query_map([], |row| {
                let id: String = row.get("id")?;
                let source_id: String = row.get("source_id")?;
                let target_title: String = row.get("target_title")?;
                Ok((id, source_id, target_title))
            })?;

            let mut raw = Vec::new();
            for row in rows {
                raw.push(row?);
            }
            raw
        };

        let mut links = Vec::new();
        for (link_id, source_id, target_title) in &raw_links {
            let source = match self.get_note(source_id)? {
                Some(note) => note,
                None => continue,
            };
            let target = self.find_note_by_title(target_title)?;

            links.push(NoteLink {
                id: link_id.clone(),
                source,
                target,
                target_title: target_title.clone(),
            });
        }
        Ok(links)
    }

    /// 按标题查找笔记
    pub fn find_note_by_title(&self, title: &str) -> Result<Option<crate::models::Note>, Error> {
        let mut note: Option<crate::models::Note> = {
            let conn = self.conn();
            let mut stmt =
                conn.prepare("SELECT * FROM notes WHERE title = ?1 AND deleted_at IS NULL")?;
            let mut rows = stmt.query_map(rusqlite::params![title], |row| {
                crate::database::note_from_row(row)
            })?;
            match rows.next() {
                Some(Ok(n)) => Ok::<_, crate::utils::Error>(Some(n)),
                _ => Ok(None),
            }
        }?;

        if let Some(ref mut n) = note {
            n.tags = self.get_note_tags(&n.id)?;
        }
        Ok(note)
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

    /// [M3.5a 反向链接(块级)] 引用当前笔记的块列表
    ///
    /// 在已建立的反向链接来源笔记中,精确到「哪一段话引用了它」:
    /// 遍历来源笔记的块,找到内容含 `[[当前标题]]` 的块,返回 块片段 + 来源笔记 + 块时间戳。
    pub fn get_block_backlinks(&self, note_id: &str) -> Result<Vec<crate::models::BlockBacklink>, Error> {
        // 目标笔记标题(链接以标题为锚)
        let note = match self.get_note(note_id)? {
            Some(n) => n,
            None => return Ok(Vec::new()),
        };
        if note.deleted_at.is_some() {
            return Ok(Vec::new());
        }
        // 笔记级反向链接(来源笔记集合)
        let sources = self.get_backlinks(note_id)?;

        // 逐来源笔记扫描块,收集真正引用目标标题的块
        let mut out: Vec<crate::models::BlockBacklink> = Vec::new();
        for src in &sources {
            // 复用块级联:来源笔记的块(含时间戳)
            {
                let blocks = self.get_note_blocks(&src.id)?;
                for b in blocks {
                    if b.content.contains(&format!("[[{}", note.title)) {
                        out.push(crate::models::BlockBacklink {
                            block_id: b.id,
                            source_note_id: src.id.clone(),
                            source_note_title: src.title.clone(),
                            content: b.content,
                            created_at: b.created_at,
                            updated_at: b.updated_at,
                        });
                    }
                }
            }
        }
        // 按更新倒序中减序
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BlockType, Note, SyncStatus};

    fn open_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("biji.db")).unwrap();
        (dir, db)
    }

    fn make_note(id: &str, title: &str, content: &str) -> Note {
        Note {
            id: id.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            folder_id: None,
            created_at: 1_000,
            updated_at: 2_000,
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        }
    }

    fn make_block(note_id: &str, content: &str, order: i64, ts: i64) -> crate::models::Block {
        crate::models::Block {
            id: uuid::Uuid::new_v4().to_string(),
            note_id: note_id.to_string(),
            parent_id: None,
            block_type: BlockType::Paragraph,
            content: content.to_string(),
            created_at: ts,
            updated_at: ts,
            sort_order: order,
        }
    }

    /// [M3.5a] 反向链接(块级):精确到引用块
    #[test]
    fn test_get_block_backlinks_matches_referencing_blocks() {
        let (_dir, db) = open_db();
        db.save_note(&make_note("target", "目标笔记", "目标内容")).unwrap();
        db.save_note(&make_note("src1", "来源一", "正文里引用 [[目标笔记]] 一次。"))
            .unwrap();
        db.save_note(&make_note("src2", "来源二", "无关内容。")).unwrap();

        // 为来源一建两块:一块引用目标,一块不引用
        db.insert_block(&make_block("src1", "这段引用 [[目标笔记]]", 0, 200)).unwrap();
        db.insert_block(&make_block("src1", "这段不引用", 1, 300)).unwrap();
        // 来源二只有一块,不引用
        db.insert_block(&make_block("src2", "没有链接", 0, 100)).unwrap();

        let backlinks = db.get_block_backlinks("target").unwrap();
        assert_eq!(backlinks.len(), 1, "应只命中 1 个引用块,实际: {:?}", backlinks);
        let bl = &backlinks[0];
        assert_eq!(bl.source_note_id, "src1");
        assert_eq!(bl.source_note_title, "来源一");
        assert!(bl.content.contains("[[目标笔记]]"));
        assert_eq!(bl.created_at, 200);
    }

    /// [M3.5a] 反向链接(块级):无引用 → 空;目标不存在 → 空
    #[test]
    fn test_get_block_backlinks_empty_cases() {
        let (_dir, db) = open_db();
        db.save_note(&make_note("lonely", "无人引用", "内容")).unwrap();
        db.save_note(&make_note("other", "其他", "不引用任何人")).unwrap();
        db.insert_block(&make_block("other", "一段话", 0, 100)).unwrap();

        let backlinks = db.get_block_backlinks("lonely").unwrap();
        assert!(backlinks.is_empty());

        let missing = db.get_block_backlinks("no-such-note").unwrap();
        assert!(missing.is_empty());
    }
}
