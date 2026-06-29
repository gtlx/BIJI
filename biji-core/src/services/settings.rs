use crate::models::AppSettings;
use crate::utils::Error;
use std::path::Path;

/// 设置管理器 — 读写 JSON 配置文件
pub struct SettingsManager {
    settings_path: String,
    settings: AppSettings,
}

impl SettingsManager {
    /// 从文件加载设置（如果文件不存在则使用默认值）
    pub fn load(settings_path: &Path) -> Result<Self, Error> {
        let settings = if settings_path.exists() {
            let content = std::fs::read_to_string(settings_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppSettings::default()
        };

        Ok(Self {
            settings_path: settings_path.to_string_lossy().to_string(),
            settings,
        })
    }

    /// 获取当前设置
    pub fn get(&self) -> &AppSettings {
        &self.settings
    }

    /// 更新设置并持久化
    pub fn set(&mut self, new_settings: AppSettings) -> Result<(), Error> {
        self.settings = new_settings;
        self.save()
    }

    /// 合并更新部分设置字段
    pub fn update(&mut self, patch: serde_json::Value) -> Result<(), Error> {
        let current = serde_json::to_value(&self.settings)?;
        if let serde_json::Value::Object(mut current_map) = current {
            if let serde_json::Value::Object(patch_map) = patch {
                for (key, value) in patch_map {
                    current_map.insert(key, value);
                }
                let merged = serde_json::from_value(serde_json::Value::Object(current_map))?;
                self.settings = merged;
            }
        }
        self.save()
    }

    /// 持久化到文件
    fn save(&self) -> Result<(), Error> {
        let dir = Path::new(&self.settings_path).parent().unwrap();
        std::fs::create_dir_all(dir)?;
        let content = serde_json::to_string_pretty(&self.settings)?;
        std::fs::write(&self.settings_path, content)?;
        Ok(())
    }

    /// 获取 UI 插件配置（存储在独立的 JSON 文件）
    pub fn get_ui_plugin_config(
        &self,
        plugin_id: &str,
    ) -> Result<crate::models::UIPluginConfig, Error> {
        let path = Self::ui_plugins_path(&self.settings_path);
        let configs = Self::load_ui_plugin_configs(&path)?;
        Ok(configs.get(plugin_id).cloned().unwrap_or_default())
    }

    /// 设置 UI 插件配置
    pub fn set_ui_plugin_config(
        &self,
        plugin_id: &str,
        config: &crate::models::UIPluginConfig,
    ) -> Result<(), Error> {
        let path = Self::ui_plugins_path(&self.settings_path);
        let mut configs = Self::load_ui_plugin_configs(&path)?;
        configs.insert(plugin_id.to_string(), config.clone());

        let content = serde_json::to_string_pretty(&configs)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    fn ui_plugins_path(settings_path: &str) -> String {
        let dir = Path::new(settings_path).parent().unwrap();
        dir.join("ui-plugins.json").to_string_lossy().to_string()
    }

    fn load_ui_plugin_configs(
        path: &str,
    ) -> Result<std::collections::HashMap<String, crate::models::UIPluginConfig>, Error> {
        let path = std::path::Path::new(path);
        if path.exists() {
            let content = std::fs::read_to_string(path)?;
            Ok(serde_json::from_str(&content).unwrap_or_default())
        } else {
            Ok(std::collections::HashMap::new())
        }
    }
}
