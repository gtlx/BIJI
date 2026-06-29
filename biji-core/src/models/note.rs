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

/// 笔记模板
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
    pub icon: Option<String>,
}

/// 默认模板
pub fn default_templates() -> Vec<NoteTemplate> {
    vec![
        NoteTemplate {
            id: "blank".into(),
            name: "空白笔记".into(),
            content: String::new(),
            icon: None,
        },
        NoteTemplate {
            id: "meeting".into(),
            name: "会议记录".into(),
            content:
                "# 会议记录\n\n## 会议主题\n\n## 参会人员\n\n## 会议内容\n\n## 待办事项\n- [ ] \n"
                    .into(),
            icon: None,
        },
        NoteTemplate {
            id: "daily".into(),
            name: "每日日志".into(),
            content: "# {{date}}\n\n## 今日完成\n\n## 遇到的问题\n\n## 明日计划\n".into(),
            icon: None,
        },
        NoteTemplate {
            id: "todo".into(),
            name: "待办清单".into(),
            content: "# 待办清单\n\n- [ ] \n- [ ] \n- [ ] \n".into(),
            icon: None,
        },
    ]
}
