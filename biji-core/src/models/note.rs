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


