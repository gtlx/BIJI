-- Biji Note M3.5b 体验增强迁移(003)
-- ① 回收站/软删除:blocks 表补 deleted_at(软删后可恢复);② 笔记模板表。
-- 版本化:PRAGMA user_version = 3 由 migrations.rs 统一控制。

-- ① 块软删字段(回收站/恢复)
ALTER TABLE blocks ADD COLUMN deleted_at INTEGER;

-- ② 笔记模板表
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'custom',
    content TEXT NOT NULL DEFAULT '',
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- 索引:读回收站按删除时间倒序
CREATE INDEX IF NOT EXISTS idx_blocks_deleted ON blocks(deleted_at);

-- ③ 内置中文模板(日记/会议/读书/空白)——建表后即种入;created_at 用固定 0 标记内置
INSERT OR IGNORE INTO templates (id, name, category, content, is_builtin, created_at) VALUES
('blank',   '空白笔记', 'blank',   '', 1, 0),
('diary',   '日记',     'diary',   '# {{date}}', 1, 0),
('meeting', '会议',     'meeting', '# {{date}} 会议纪要', 1, 0),
('reading', '读书',     'reading', '# 《书名》读书笔记', 1, 0);
