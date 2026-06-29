use serde::{Deserialize, Serialize};

/// 文件夹数据模型
/// 对应 TypeScript 的 Folder 接口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: i64,
    pub color: Option<String>,
    pub deleted_at: Option<i64>,
}
