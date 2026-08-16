-- Biji Note M2 块级存储迁移(002)
-- 新增块表 + 块历史表;notes 表保留(元数据/frontmatter),块归属 note。
-- 版本化:PRAGMA user_version = 2 由 migrations.rs 统一控制。

CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    parent_id TEXT,
    type TEXT NOT NULL DEFAULT 'paragraph',
    content TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES blocks(id) ON DELETE SET NULL
);

-- 块历史:内容快照 + 变更时间 + 变更类型。
-- 块被硬删时 history 行保留(block_id 置 NULL,审计轨迹不丢)。
CREATE TABLE IF NOT EXISTS block_history (
    id TEXT PRIMARY KEY,
    block_id TEXT,
    content_snapshot TEXT NOT NULL DEFAULT '',
    changed_at INTEGER NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'update',
    FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE SET NULL
);

-- 笔记内按 sort_order 取块序列
CREATE INDEX IF NOT EXISTS idx_blocks_note ON blocks(note_id, sort_order);
-- 块历史按时间取时间线
CREATE INDEX IF NOT EXISTS idx_block_history_block ON block_history(block_id, changed_at);
