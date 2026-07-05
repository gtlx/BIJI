use crate::database::Database;
use crate::models::Plugin;
use std::collections::HashMap;
use std::path::Path;

/// 内置插件清单
pub fn built_in_plugins() -> Vec<Plugin> {
    vec![
        Plugin {
            id: "pomodoro-plugin".into(),
            name: "番茄钟".into(),
            version: "1.0.0".into(),
            description: "专注计时器，帮助您保持专注和高效".into(),
            author: "Biji Note".into(),
            enabled: true,
            permissions: vec![],
            entry_point: String::new(),
            provides: None,
            built_in: Some(true),
            settings_key: None,
        },
        Plugin {
            id: "sync-plugin".into(),
            name: "云同步".into(),
            version: "1.0.0".into(),
            description: "将笔记同步到云端或本地文件夹".into(),
            author: "Biji Note".into(),
            enabled: false,
            permissions: vec![
                crate::models::PluginPermission {
                    perm_type: crate::models::PermissionType::Storage,
                    allowed: true,
                },
                crate::models::PluginPermission {
                    perm_type: crate::models::PermissionType::Network,
                    allowed: true,
                },
            ],
            entry_point: String::new(),
            provides: None,
            built_in: Some(true),
            settings_key: None,
        },
    ]
}

/// 插件管理器
pub struct PluginManager {
    _plugins_dir: String,
    _database: std::sync::Arc<Database>,
    plugins: HashMap<String, Plugin>,
}

impl PluginManager {
    pub fn new(database: std::sync::Arc<Database>, plugins_dir: &Path) -> Self {
        let mut plugins: HashMap<String, Plugin> = HashMap::new();
        for p in built_in_plugins() {
            plugins.insert(p.id.clone(), p);
        }

        Self {
            _plugins_dir: plugins_dir.to_string_lossy().to_string(),
            _database: database,
            plugins,
        }
    }

    /// 获取所有插件
    pub fn get_all(&self) -> Vec<Plugin> {
        self.plugins.values().cloned().collect()
    }

    /// 启用/禁用插件
    pub fn toggle(&mut self, id: &str, enabled: bool) -> Result<(), crate::utils::Error> {
        if let Some(plugin) = self.plugins.get_mut(id) {
            plugin.enabled = enabled;
            log::info!(
                "Plugin {} {}",
                id,
                if enabled { "enabled" } else { "disabled" }
            );
            Ok(())
        } else {
            Err(crate::utils::Error::PluginError(format!(
                "Plugin not found: {}",
                id
            )))
        }
    }

    /// 检查插件是否启用
    pub fn is_enabled(&self, id: &str) -> bool {
        self.plugins.get(id).map(|p| p.enabled).unwrap_or(false)
    }
}
