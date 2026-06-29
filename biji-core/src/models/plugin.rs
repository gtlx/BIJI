use serde::{Deserialize, Serialize};

/// 插件数据模型
/// 对应 TypeScript 的 Plugin / UIPluginManifest / UIPluginConfig 等
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub enabled: bool,
    pub permissions: Vec<PluginPermission>,
    pub entry_point: String,
    pub provides: Option<Vec<String>>,
    pub built_in: Option<bool>,
    pub settings_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginPermission {
    #[serde(rename = "type")]
    pub perm_type: PermissionType,
    pub allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionType {
    Storage,
    Network,
    Filesystem,
    Clipboard,
    Notification,
}

/// UI 插件清单（外部插件用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIPluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    #[serde(rename = "type")]
    pub plugin_type: PluginType,
    pub entry: String,
    pub styles: Option<String>,
    pub position: PluginPosition,
    pub permissions: Vec<PluginPermission>,
    pub data: Option<serde_json::Value>,
    pub min_app_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginType {
    #[serde(rename = "ui")]
    Ui,
    #[serde(rename = "system")]
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginPosition {
    #[serde(rename = "right-panel")]
    RightPanel,
    Toolbar,
    Sidebar,
    Modal,
    Statusbar,
}

/// UI 插件配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIPluginConfig {
    pub enabled: bool,
    pub settings: Option<serde_json::Value>,
}

impl Default for UIPluginConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            settings: None,
        }
    }
}
