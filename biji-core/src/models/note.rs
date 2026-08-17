use serde::{Deserialize, Serialize};

/// 笔记数据模型
/// 对应 TypeScript 的 Note 接口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
    pub folder_id: Option<String>,
    pub is_encrypted: bool,
    pub sync_status: SyncStatus,
    pub deleted_at: Option<i64>,
    pub frontmatter: Option<NoteFrontmatter>,
}

/// 笔记同步状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Synced,
    Pending,
    Conflict,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// YAML Frontmatter
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NoteFrontmatter {
    pub title: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub completed: Option<bool>,
}

/// 笔记链接（[[链接]] 解析结果）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteLink {
    pub id: String,
    pub source: Note,
    pub target: Option<Note>,
    pub target_title: String,
}

/// [M3.5a 标签树] 标签及笔记计数
///
/// 侧栏「标签」区:列出所有标签 + 各自笔记数,可展开该标签下笔记 / 点击过滤笔记列表。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TagCount {
    pub name: String,
    pub count: i64,
}
