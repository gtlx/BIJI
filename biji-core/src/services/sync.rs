use crate::database::Database;
use crate::models::sync::SyncStatus;
use crate::models::SyncResult;
use crate::services::webdav::WebDAVClient;
use crate::utils::Error;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// 同步管理器
pub struct SyncManager {
    database: Arc<Database>,
    is_syncing: AtomicBool,
    last_sync_time: std::sync::Mutex<i64>,
}

impl SyncManager {
    pub fn new(database: Arc<Database>) -> Self {
        Self {
            database,
            is_syncing: AtomicBool::new(false),
            last_sync_time: std::sync::Mutex::new(0),
        }
    }

    /// 执行同步（阻塞）
    pub fn sync(&self, provider: &crate::models::WebDAVConfig) -> Result<SyncResult, Error> {
        if self.is_syncing.swap(true, Ordering::SeqCst) {
            return Ok(SyncResult {
                success: false,
                uploaded: 0,
                downloaded: 0,
                deleted: 0,
                conflicts: vec![],
                error: Some("Sync already in progress".into()),
            });
        }

        let result = self.do_sync(provider);
        self.is_syncing.store(false, Ordering::SeqCst);
        result
    }

    fn do_sync(&self, config: &crate::models::WebDAVConfig) -> Result<SyncResult, Error> {
        let client = WebDAVClient::new(
            &config.url,
            config.username.as_deref(),
            config.password.as_deref(),
        );

        // 确保远程目录存在
        client.ensure_base_path()?;

        // 1. 上传待同步的笔记
        let pending = self.database.get_pending_sync_notes()?;
        let mut uploaded = 0u32;
        for note in &pending {
            let data = serde_json::to_string(note)?;
            let filename = format!("{}.json", note.id);
            if client.upload_file(&filename, &data)? {
                uploaded += 1;
            }
        }

        // 2. 下载远程笔记
        let remote_files = client.list_files()?;
        let mut downloaded = 0u32;

        for filename in &remote_files {
            if !filename.ends_with(".json") {
                continue;
            }

            if let Some(content) = client.download_file(filename)? {
                if let Ok(remote_note) = serde_json::from_str::<crate::models::Note>(&content) {
                    let local = self.database.get_note(&remote_note.id)?;
                    if local.is_none() || remote_note.updated_at > local.unwrap().updated_at {
                        self.database.save_note(&remote_note)?;
                        downloaded += 1;
                    }
                }
            }
        }

        // 3. 标记已同步
        let synced_ids: Vec<String> = pending.iter().map(|n| n.id.clone()).collect();
        if !synced_ids.is_empty() {
            self.database.mark_synced(&synced_ids)?;
        }

        *self.last_sync_time.lock().unwrap() = chrono::Utc::now().timestamp_millis();

        Ok(SyncResult {
            success: true,
            uploaded,
            downloaded,
            deleted: 0,
            conflicts: vec![],
            error: None,
        })
    }

    /// 获取同步状态
    pub fn get_status(&self) -> crate::models::sync::SyncStatus {
        let pending = self
            .database
            .get_pending_sync_notes()
            .map(|n| n.len() as u32)
            .unwrap_or(0);

        SyncStatus {
            is_syncing: self.is_syncing.load(Ordering::SeqCst),
            last_sync: *self.last_sync_time.lock().unwrap(),
            pending,
            progress: None,
            error: None,
        }
    }
}
