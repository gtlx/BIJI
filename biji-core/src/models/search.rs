use serde::{Deserialize, Serialize};

/// 检索双模式(M2 落地)
///
/// PLAN.md「检索双模式」:标题检索(找文件)/ 全文检索(找内容,按块命中)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SearchMode {
    /// 标题模式:只匹配笔记标题,返回笔记列表
    #[default]
    Title,
    /// 内容模式:按块命中,返回命中块 + 所在笔记 + 片段
    Content,
}

/// 搜索查询参数
/// 对应 TypeScript 的 SearchQuery
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchQuery {
    pub keyword: Option<String>,
    pub tags: Option<Vec<String>>,
    pub folder_id: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub include_deleted: Option<bool>,
    /// 双模式检索开关(title/content),缺省为标题模式
    #[serde(default)]
    pub mode: Option<SearchMode>,
}
