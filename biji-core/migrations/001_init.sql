-- Biji Note 初始数据库 schema
-- 与原项目 sqlite-database.ts 完全兼容

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '无标题',
    content TEXT DEFAULT '',
    folder_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_encrypted INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending',
    deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    color TEXT,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_title TEXT NOT NULL,
    link_type TEXT DEFAULT 'wikilink',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_title);

-- FTS5 全文搜索（v2 可添加）
-- CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
--     title, content, content='notes', content_rowid='rowid'
-- );
