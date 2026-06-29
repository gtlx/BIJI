use serde::{Deserialize, Serialize};

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
}
