use serde::{Deserialize, Serialize};

/// [M3.5b 笔记模板] 新建笔记时插入的预设内容模板
///
/// - 内置模板(diary/meeting/reading/blank)不可删,由迁移种入;
/// - 用户自定义模板可增删改,存 `templates` 表。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteTemplate {
    pub id: String,
    /// 模板名(中文展示,如「日记」「会议」)
    pub name: String,
    /// 分类:blank / diary / meeting / reading / custom
    pub category: String,
    /// 模板正文(markdown;可含 {{date}} 占位符,新建时替换为当天日期)
    pub content: String,
    /// 是否内置模板(内置不可删除)
    pub is_builtin: bool,
    pub created_at: i64,
}
