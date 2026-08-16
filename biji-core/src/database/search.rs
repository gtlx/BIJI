use crate::database::Database;
use crate::models::block::BlockSearchResult;
use crate::models::{Note, SearchMode, SearchQuery};
use crate::utils::Error;

/// 双模式检索的统一入口(M2)
///
/// - Title:标题索引(notes.title),返回笔记列表
/// - Content:内容索引(blocks.content 联合),返回按块命中(命中块 + 笔记 + 片段)
///
/// 既有 search_notes(query) 保持原语义(标题+内容 LIKE 兜底),供 Tauri 命令等旧调用方使用。
pub fn search_by_mode(
    db: &Database,
    query: &SearchQuery,
    mode: SearchMode,
) -> Result<SearchModeResult, Error> {
    let keyword = query.keyword.as_deref().unwrap_or("");
    if keyword.trim().is_empty() {
        return Ok(match mode {
            SearchMode::Title => SearchModeResult::Notes(Vec::new()),
            SearchMode::Content => SearchModeResult::Blocks(Vec::new()),
        });
    }
    match mode {
        SearchMode::Title => Ok(SearchModeResult::Notes(db.search_notes_by_title(keyword)?)),
        SearchMode::Content => Ok(SearchModeResult::Blocks(db.search_blocks(keyword)?)),
    }
}

/// 双模式搜索的返回形态(untagged:前端按数组元素类型区分)
#[derive(Debug, Clone, serde::Serialize)]
#[serde(untagged)]
pub enum SearchModeResult {
    Notes(Vec<Note>),
    Blocks(Vec<BlockSearchResult>),
}

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
