use serde::{Deserialize, Serialize};

/// 同步结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub uploaded: u32,
    pub downloaded: u32,
    pub deleted: u32,
    pub conflicts: Vec<String>, // note ids
    pub error: Option<String>,
}

/// 同步状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_syncing: bool,
    pub last_sync: i64,
    pub pending: u32,
    pub progress: Option<f32>,
    pub error: Option<String>,
}

/// WebDAV 同步配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDAVConfig {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub base_path: Option<String>,
}


