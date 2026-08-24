use crate::database::Database;
use crate::models::{Plugin, PluginPermission, PermissionType};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

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
                PluginPermission {
                    perm_type: PermissionType::Storage,
                    allowed: true,
                },
                PluginPermission {
                    perm_type: PermissionType::Network,
                    allowed: true,
                },
            ],
            entry_point: String::new(),
            provides: None,
            built_in: Some(true),
            settings_key: None,
        },
        Plugin {
            id: "publish-plugin".into(),
            name: "发布".into(),
            version: "1.0.0".into(),
            description: "把笔记导出/发布到静态博客(多框架适配器:Astro 等)".into(),
            author: "Biji Note".into(),
            enabled: true,
            permissions: vec![PluginPermission {
                perm_type: PermissionType::Storage,
                allowed: true,
            }],
            entry_point: String::new(),
            // 能力插件:声名它提供的核心能力 id(接入 CapabilityRegistry 的桥梁)
            provides: Some(vec!["publish".into()]),
            built_in: Some(true),
            settings_key: None,
        },
    ]
}

/// 外部插件声明文件契约(plugin.json,声明驱动,非二进制动态加载)
///
/// 扫描约定(默认外部插件目录 = 应用数据目录下的 plugins/,见 [`PluginManager::default_dir`]):
///   1. `plugins/<插件名>/plugin.json` — 每个插件子目录内放声明文件
///   2. `plugins/<插件名>.json`       — 或直接在插件目录(同级)放 `<插件名>.json`
///
/// plugin.json 字段契约(serde_json 解析,`id`/`name`/`version` 必填,其余可缺省):
/// ```json
/// {
///   "id": "hello-plugin",
///   "name": "问候",
///   "version": "0.1.0",
///   "description": "插件简介",
///   "author": "作者",
///   "enabled": false,
///   "permissions": ["storage", "network"],
///   "provides": ["greet"],
///   "entry_point": ""
/// }
/// ```
/// 字段说明:
///   - `permissions`:权限类型字符串(`storage`/`network`/`filesystem`/`clipboard`/`notification`),
///     未知值跳过并记日志
///   - `provides`:该插件声明提供的能力 id 列表(接入 CapabilityRegistry 的桥梁)
///   - `built_in`:由加载程序固定置为 false,声明文件无需写
///   - `settings_key`:预留,暂未使用
#[derive(Debug, Deserialize)]
struct ExternalPluginDecl {
    id: String,
    name: String,
    version: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    permissions: Option<Vec<String>>,
    #[serde(default)]
    provides: Option<Vec<String>>,
    #[serde(default)]
    entry_point: Option<String>,
}

/// 权限字符串 → PermissionType;未知返回 None
fn parse_permission(s: &str) -> Option<PermissionType> {
    match s.to_ascii_lowercase().as_str() {
        "storage" => Some(PermissionType::Storage),
        "network" => Some(PermissionType::Network),
        "filesystem" => Some(PermissionType::Filesystem),
        "clipboard" => Some(PermissionType::Clipboard),
        "notification" => Some(PermissionType::Notification),
        _ => {
            log::warn!("插件声明含未知权限类型: {}", s);
            None
        }
    }
}

impl ExternalPluginDecl {
    fn into_plugin(self) -> Plugin {
        let permissions = self
            .permissions
            .unwrap_or_default()
            .into_iter()
            .filter_map(|s| parse_permission(&s))
            .map(|perm_type| PluginPermission {
                perm_type,
                allowed: true,
            })
            .collect();
        Plugin {
            id: self.id,
            name: self.name,
            version: self.version,
            description: self.description.unwrap_or_default(),
            author: self.author.unwrap_or_default(),
            // 外部插件默认禁用(显式声明 enabled:true 才启用),首次打开可安全性更低
            enabled: self.enabled.unwrap_or(false),
            permissions,
            entry_point: self.entry_point.unwrap_or_default(),
            provides: self.provides.filter(|v| !v.is_empty()),
            built_in: Some(false),
            settings_key: None,
        }
    }
}

/// 读取单个插件声明 JSON 文件并转为 Plugin;失败(io/坏 JSON/缺必填字段)记日志并跳过
fn load_external_decl(path: &Path) -> Option<Plugin> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("读取插件声明 {} 失败: {}", path.display(), e);
            return None;
        }
    };
    match serde_json::from_str::<ExternalPluginDecl>(&content) {
        Ok(decl) => {
            log::info!("已加载外部插件声明: {} ({})", decl.name, decl.id);
            Some(decl.into_plugin())
        }
        Err(e) => {
            log::warn!("解析插件声明 {} 失败,已跳过: {}", path.display(), e);
            None
        }
    }
}

/// 插件管理器
pub struct PluginManager {
    database: Arc<Database>,
    plugins: HashMap<String, Plugin>,
}

impl PluginManager {
    pub fn new(database: Arc<Database>, plugins_dir: &Path) -> Self {
        let mut plugins: HashMap<String, Plugin> = HashMap::new();
        for p in built_in_plugins() {
            plugins.insert(p.id.clone(), p);
        }

        // 扫描 plugins_dir 下外部插件声明并入列表(built-in 与 external 并存同列表)
        for p in Self::load_external_plugins(plugins_dir) {
            let id = p.id.clone();
            if plugins.contains_key(&id) {
                log::warn!("外部插件 {} 与内置插件同名,已忽略", id);
            } else {
                plugins.insert(id, p);
            }
        }

        let mut mgr = Self {
            database,
            plugins,
        };
        // 从 plugin_state 表恢复插件启用状态(内置+外部统一持久化,toggle 跨重启生效)
        mgr.restore_enabled_states();
        mgr
    }

    /// 默认外部插件目录(= 应用数据目录下的 plugins/,见 lib.rs App::init)
    pub fn default_dir(data_dir: &Path) -> PathBuf {
        data_dir.join("plugins")
    }

    /// 扫描 plugins_dir 下所有外部插件声明文件
    ///
    /// 目录不存在/为空/读不了 → 返回空 vec(静默当作无外部插件、不报错),built-in 照常。
    fn load_external_plugins(plugins_dir: &Path) -> Vec<Plugin> {
        if !plugins_dir.is_dir() {
            return Vec::new();
        }
        let entries = match std::fs::read_dir(plugins_dir) {
            Ok(e) => e,
            Err(e) => {
                log::warn!("读取外部插件目录 {} 失败: {}", plugins_dir.display(), e);
                return Vec::new();
            }
        };

        // 收集候选声明路径:子目录下的 plugin.json + 插件目录内直接的 *.json
        let mut candidates: Vec<PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                candidates.push(path.join("plugin.json"));
            } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
                candidates.push(path);
            }
        }

        let mut out = Vec::new();
        for cand in candidates {
            if cand.is_file() {
                if let Some(p) = load_external_decl(&cand) {
                    out.push(p);
                }
            }
        }
        out
    }

    /// 从数据库 plugin_state 表覆盖插件启用状态
    fn restore_enabled_states(&mut self) {
        let conn = self.database.conn();
        let rows = match conn.prepare("SELECT id, enabled FROM plugin_state") {
            Ok(mut stmt) => stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
                .map(|it| it.flatten().collect::<Vec<_>>()),
            Err(_) => return, // 表不存在(极早期库)时静默
        };
        if let Ok(rows) = rows {
            for (id, enabled) in rows {
                if let Some(p) = self.plugins.get_mut(&id) {
                    p.enabled = enabled != 0;
                }
            }
        }
    }

    /// 持久化某个插件启用状态到 plugin_state 表
    fn save_enabled_state(&self, id: &str, enabled: bool) {
        if let Err(e) = self.database.conn().execute(
            "INSERT INTO plugin_state (id, enabled) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled",
            rusqlite::params![id, enabled as i64],
        ) {
            log::warn!("持久化插件 {} 启用状态失败: {}", id, e);
        }
    }

    /// 获取所有插件(内置 + 外部合并列表)
    pub fn get_all(&self) -> Vec<Plugin> {
        self.plugins.values().cloned().collect()
    }

    /// 启用/禁用插件(内置与外部统一生效,并把状态持久化到 plugin_state 表)
    pub fn toggle(&mut self, id: &str, enabled: bool) -> Result<(), crate::utils::Error> {
        if let Some(plugin) = self.plugins.get_mut(id) {
            plugin.enabled = enabled;
            self.save_enabled_state(id, enabled);
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 写一个插件声明文件(自动建父目录)
    fn write_decl(path: &Path, json: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, json).unwrap();
    }

    fn make_db(dir: &Path) -> Arc<Database> {
        Arc::new(Database::open(&dir.join("test.db")).unwrap())
    }

    /// 有插件声明文件 → 成功加载并入列表,与内置并存
    #[test]
    fn test_publish_plugin_registered_with_provides() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("test.db")).unwrap();
        let plugin_manager = PluginManager::new(std::sync::Arc::new(db), dir.path());
        let all = plugin_manager.get_all();
        let publish = all
            .iter()
            .find(|p| p.id == "publish-plugin")
            .expect("应有 publish-plugin");
        assert_eq!(publish.name, "发布");
        assert_eq!(publish.enabled, true);
        assert_eq!(publish.provides.as_deref(), Some(&["publish".to_string()][..]));
        // 开关:禁用后 is_enabled 变 false
        let mut pm = plugin_manager;
        assert!(pm.toggle("publish-plugin", false).is_ok());
        assert!(!pm.is_enabled("publish-plugin"));
    }

    /// 场景 1:有插件声明文件(子目录 plugin.json)→ 加载成功
    #[test]
    fn test_external_plugin_loads_from_decl() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        write_decl(
            &plugins_dir.join("hello/plugin.json"),
            r#"{"id":"hello-plugin","name":"问候","version":"0.1.0","description":"打个招呼","author":"gtlx","enabled":false,"permissions":["storage"],"provides":["greet"]}"#,
        );
        let pm = PluginManager::new(make_db(tmp.path()), &plugins_dir);
        let all = pm.get_all();
        let hello = all
            .iter()
            .find(|p| p.id == "hello-plugin")
            .expect("应有外部插件 hello-plugin");
        assert_eq!(hello.name, "问候");
        assert_eq!(hello.built_in, Some(false));
        assert_eq!(hello.provides.as_deref(), Some(&["greet".to_string()][..]));
        assert_eq!(hello.permissions.len(), 1);
        // PermissionType 未实现 PartialEq,用 matches! 断言类型
        assert!(matches!(hello.permissions[0].perm_type, PermissionType::Storage));
        // 声明 enabled:false → 默认禁用
        assert_eq!(hello.enabled, false);
        // 内置 3 个 + 外部 1 个 = 4
        assert_eq!(all.len(), 4);
    }

    /// 场景 2:目录不存在 / 为空 → 静默无外部插件(内置 3 个照常)
    #[test]
    fn test_external_no_dir_silent() {
        let tmp = tempfile::tempdir().unwrap();
        let db = make_db(tmp.path());
        // 目录不存在
        let pm = PluginManager::new(db.clone(), &tmp.path().join("no-plugins"));
        assert_eq!(pm.get_all().len(), 3);
        assert!(pm.get_all().iter().all(|p| p.built_in == Some(true)));
        // 目录存在但为空
        let empty = tmp.path().join("empty-plugins");
        std::fs::create_dir_all(&empty).unwrap();
        let pm2 = PluginManager::new(db, &empty);
        assert_eq!(pm2.get_all().len(), 3);
    }

    /// 场景 3:外部插件可 toggle,且状态持久化(重启仍生效)
    #[test]
    fn test_external_can_toggle_and_persist() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        write_decl(
            &plugins_dir.join("hello/plugin.json"),
            r#"{"id":"hello-plugin","name":"问候","version":"0.1.0","enabled":true}"#,
        );
        // 首次打开:声明 enabled:true → 启用
        let pm = PluginManager::new(make_db(tmp.path()), &plugins_dir);
        assert!(pm.is_enabled("hello-plugin"));
        // toggle 关闭
        let mut pm = pm;
        assert!(pm.toggle("hello-plugin", false).is_ok());
        assert!(!pm.is_enabled("hello-plugin"));
        drop(pm);
        // 重新打开同一 database:启用状态应从 plugin_state 表恢复为禁用
        let pm2 = PluginManager::new(make_db(tmp.path()), &plugins_dir);
        assert!(!pm2.is_enabled("hello-plugin"), "toggle 后重启应保持禁用");
    }

    /// 场景 3b:位于插件目录的松散 <插件名>.json 声明也能加载
    #[test]
    fn test_external_loose_json_file_in_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        std::fs::write(
            plugins_dir.join("loose.json"),
            r#"{"id":"loose-plugin","name":"松散","version":"2.0.0","enabled":true}"#,
        )
        .unwrap();
        let pm = PluginManager::new(make_db(tmp.path()), &plugins_dir);
        let all = pm.get_all();
        let loose = all
            .iter()
            .find(|p| p.id == "loose-plugin")
            .expect("应有松散声明的外部插件");
        assert_eq!(loose.version, "2.0.0");
        assert_eq!(loose.built_in, Some(false));
    }
}