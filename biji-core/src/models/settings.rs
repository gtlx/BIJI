use serde::{Deserialize, Serialize};

/// 工具栏位置
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub enum ToolbarPosition {
    #[default]
    Left,
    Right,
}

/// 应用设置
/// 对应 TypeScript 的 AppSettings 接口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: ThemeMode,
    pub font_size: u32,
    pub font_family: String,
    pub language: String,
    pub sync_enabled: bool,
    pub sync_provider: Option<SyncProviderType>,
    pub sync_mode: SyncMode,
    pub sync_path: String,
    pub sync_web_url: String,
    pub sync_web_token: String,
    pub sync_web_username: String,
    pub sync_web_password: String,
    pub encryption_enabled: bool,
    pub encryption_key: String,
    pub auto_save: bool,
    pub auto_save_interval: u64,
    pub editor_mode: EditorMode,
    pub markdown_preview_mode: MarkdownPreviewMode,
    pub storage_path: String,
    pub template: String,
    #[serde(default)]
    pub toolbar_position: ToolbarPosition,
    pub custom_css: String,
    pub ui_custom_css: UICustomCSS,
    pub zoom: u32,
    pub shortcuts: ShortcutSettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncProviderType {
    Google,
    Onedrive,
    Local,
    Web,
    Webdav,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncMode {
    Incremental,
    Bidirectional,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EditorMode {
    Rich,
    Markdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarkdownPreviewMode {
    Live,
    Edit,
    Preview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UICustomCSS {
    pub main_content: String,
    pub left_sidebar: String,
    pub right_sidebar: String,
    pub editor: String,
    pub note_list: String,
}

impl Default for UICustomCSS {
    fn default() -> Self {
        Self {
            main_content: String::new(),
            left_sidebar: String::new(),
            right_sidebar: String::new(),
            editor: String::new(),
            note_list: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutSettings {
    pub new_note: String,
    pub new_folder: String,
    pub save: String,
    pub search: String,
    pub toggle_theme: String,
    pub open_settings: String,
    pub sync: String,
    pub toggle_left_sidebar: String,
    pub toggle_right_sidebar: String,
    pub toggle_graph: String,
    pub toggle_outline: String,
    pub toggle_preview_mode: String,
    pub toggle_editor_mode: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            new_note: "Ctrl+N".into(),
            new_folder: "Ctrl+Shift+N".into(),
            save: "Ctrl+S".into(),
            search: "Ctrl+F".into(),
            toggle_theme: "Ctrl+Alt+T".into(),
            open_settings: "Ctrl+,".into(),
            sync: "Ctrl+Shift+S".into(),
            toggle_left_sidebar: "Ctrl+[".into(),
            toggle_right_sidebar: "Ctrl+]".into(),
            toggle_graph: "Ctrl+G".into(),
            toggle_outline: "Ctrl+O".into(),
            toggle_preview_mode: "Ctrl+P".into(),
            toggle_editor_mode: "Ctrl+E".into(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            font_size: 14,
            font_family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif".into(),
            language: "zh-CN".into(),
            sync_enabled: false,
            sync_provider: None,
            sync_mode: SyncMode::Incremental,
            sync_path: String::new(),
            sync_web_url: String::new(),
            sync_web_token: String::new(),
            sync_web_username: String::new(),
            sync_web_password: String::new(),
            encryption_enabled: false,
            encryption_key: String::new(),
            auto_save: true,
            auto_save_interval: 30000,
            editor_mode: EditorMode::Markdown,
            markdown_preview_mode: MarkdownPreviewMode::Live,
            storage_path: String::new(),
            template: "blank".into(),
            toolbar_position: ToolbarPosition::Left,
            custom_css: String::new(),
            ui_custom_css: UICustomCSS::default(),
            zoom: 100,
            shortcuts: ShortcutSettings::default(),
        }
    }
}
