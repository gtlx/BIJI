//! ## 克制版「能力插件」接口 —— 发布多博客框架适配器
//!
//! 架构基调(2026-08-19 用户拍板):核心定义**能力接口 trait**,插件注册时声明
//! "我提供这个能力";发布作为第一个能力插件样板,多博客框架 = 多个 `PublishAdapter`。
//!
//! 原则:
//! - **面向接口,不面向实现**:核心只认 `PublishAdapter` 契约,不认 Astro/Hugo 具体实现。
//! - **留彻底版接缝**:adapter 注册表用「注册+可枚举」而非写死 `match`,将来动态加载插件包
//!   时只往 `registry` 加条目,核心调度代码不改。(用户确认:克制版→彻底版是平滑演进)
//! - 纯函数、可单测,不依赖 GUI/网络。

use std::path::{Path, PathBuf};

/// 待发布的一篇笔记(从 BIJI 核心取出的元数据 + 正文)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BijiNoteMeta {
    /// 笔记标题
    pub title: String,
    /// 正文(markdown)
    pub content: String,
    /// 所属文件夹路径(如 "日记/2026" 或空) —— 映射到博客子目录
    pub folder: Option<String>,
    /// 标签列表 —— 映射到 frontmatter tags
    pub tags: Vec<String>,
    /// 创建/更新时间(可空)
    pub published: Option<String>,
    pub updated: Option<String>,
}

/// 发布计划:一篇笔记要写成的目标文件(路径 + 渲染后的完整内容含 frontmatter)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PublishFilePlan {
    /// 相对目标目录的路径,如 "posts/我的笔记.md"
    pub rel_path: String,
    /// 完整写入内容(frontmatter + 正文)
    pub content: String,
}

/// 识别结果:目标目录是否被某框架识别 + 该框架的展示信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FrameworkDetect {
    pub framework: String,
    pub detected: bool,
    /// 识别到的 content 根说明(如 "./blog" / "content")
    pub content_root: Option<String>,
    pub note: Option<String>,
}

/// ## 博客框架适配器接口(核心能力契约)
///
/// 每个博客框架(astro/hugo/vitepress...)= 一个 adapter 实现。
/// 甲方:BIJI 发布能力(核心)只调用这个 trait;乙方:各框架 adapter。
/// `Send + Sync`:能力注册表可能被放进共享状态(App),要求适配器可跨线程安全共享。
pub trait PublishAdapter: Send + Sync {
    /// 框架标识,如 "astro" / "hugo"
    fn framework(&self) -> &str;
    /// 展示名
    fn display_name(&self) -> &str {
        self.framework()
    }
    /// 识别:给定目标目录,判断是否属于本框架(读标志文件/目录结构)
    fn detect(&self, dir: &Path) -> bool;
    /// 识别说明(给前端预览):content 根、收集规则等
    fn detect_info(&self, dir: &Path) -> FrameworkDetect;
    /// 映射:把笔记 → 发布文件计划(路径 + frontmatter 内容)
    fn map(&self, notes: &[BijiNoteMeta]) -> Vec<PublishFilePlan>;
    /// 写盘前提示(安全提示/该框架注意点)
    fn safety_note(&self) -> Option<String> {
        None
    }
}

/// ## 能力接口:发布能力声明自身提供哪些框架适配器(克制版能力插件入口)
///
/// 将来彻底版:插件包实现此 trait 并注册进 `CapabilityRegistry`,核心调度不变。
pub trait PublishCapability {
    /// 能力标识
    fn capability(&self) -> &str {
        "publish"
    }
    /// 此发布能力支持的框架适配器列表
    fn adapters(&self) -> Vec<&dyn PublishAdapter>;
    /// 取某框架的适配器
    fn adapter(&self, framework: &str) -> Option<&dyn PublishAdapter> {
        self.adapters().into_iter().find(|a| a.framework() == framework)
    }
}

/// ## 能力注册表(留彻底版接缝)
///
/// 现在:静态注册内置能力。将来:动态加载插件包的能力也注册到这里,调度代码不改。
pub struct CapabilityRegistry {
    /// 能力 id → 能力 trait 对象(此处先只放发布能力;可扩展 AI/Sync 等)
    adapters: Vec<&'static (dyn PublishAdapter + Send + Sync)>,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        let mut r = Self { adapters: Vec::new() };
        r.register_astronomy(); // ← 接缝:将来加框架/能力就在这里 register
        r
    }
    /// 注册一个框架适配器(静态;将来动态加载也走这里)
    pub fn register(&mut self, a: &'static (dyn PublishAdapter + Send + Sync)) {
        if !self.adapters.iter().any(|x| x.framework() == a.framework()) {
            self.adapters.push(a);
        }
    }
    #[allow(non_snake_case)]
    fn register_astronomy(&mut self) {
        self.register(&AstroAdapter);
    }
    pub fn all(&self) -> Vec<&(dyn PublishAdapter + Send + Sync)> {
        self.adapters.iter().map(|a| *a).collect()
    }
    pub fn get(&self, framework: &str) -> Option<&(dyn PublishAdapter + Send + Sync)> {
        self.all().into_iter().find(|a| a.framework() == framework)
    }
    pub fn is_empty(&self) -> bool {
        self.adapters.is_empty()
    }
}

impl Default for CapabilityRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================
// Astro 适配器(第一个样板,以用户真实博客为准:
//   content 根 ./blog,glob loader 收 **/*.{md,mdx},frontmatter schema)
// ============================================================

pub struct AstroAdapter;

/// 去掉 frontmatter 后的正文(markdown 正文本身)
fn strip_frontmatter(content: &str) -> &str {
    let c = content.trim_start();
    if let Some(rest) = c.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            return rest[end + 5..].trim_start();
        }
    }
    c
}

/// 生成 Astro frontmatter(`title` 必填,`published`/`updated` 日期,`tags` 数组)
fn astro_frontmatter(note: &BijiNoteMeta) -> String {
    let mut fm = String::from("---\n");
    fm.push_str(&format!("title: \"{}\"\n", note.title.replace('"', "\\\"")));
    if let Some(p) = &note.published {
        fm.push_str(&format!("published: {}\n", p));
    }
    if let Some(u) = &note.updated {
        fm.push_str(&format!("updated: {}\n", u));
    }
    if !note.tags.is_empty() {
        let tags = note.tags.iter().map(|t| format!("\"{}\"", t)).collect::<Vec<_>>().join(", ");
        fm.push_str(&format!("tags: [{}]\n", tags));
    }
    fm.push_str("---\n\n");
    fm
}

/// 文件夹 → 博客子目录:按笔记 folder 的末级映射到 "posts"(先简化:一律归 posts,
/// 可由后续适配器配置)。真实 Default Astro blog 的 posts collection 在 ./blog/posts。
fn astro_dir_for(_folder: &Option<String>) -> String {
    "posts".to_string()
}

impl PublishAdapter for AstroAdapter {
    fn framework(&self) -> &str {
        "astro"
    }
    fn display_name(&self) -> &str {
        "Astro"
    }

    fn detect(&self, dir: &Path) -> bool {
        // Astro 项目标志:astro.config.{mjs,js,ts} 或 src/content.config.ts
        let has_config = ["astro.config.mjs", "astro.config.js", "astro.config.ts", "astro.config.mts"]
            .iter().any(|f| dir.join(f).exists());
        let has_content_cfg = dir.join("src/content.config.ts").exists()
            || dir.join("src/content.config.js").exists();
        has_config || has_content_cfg
    }

    fn detect_info(&self, dir: &Path) -> FrameworkDetect {
        let content_root = if dir.join("src/content.config.ts").exists() || dir.join("src/content.config.js").exists() {
            Some("./blog".to_string()) // glob loader 的 base 通常是 ./blog
        } else if dir.join("content").is_dir() {
            Some("./content".to_string())
        } else {
            None
        };
        FrameworkDetect {
            framework: "astro".to_string(),
            detected: self.detect(dir),
            content_root,
            note: Some("glob loader 会加载 content 下 **/*.{md,mdx}".to_string()),
        }
    }

    fn map(&self, notes: &[BijiNoteMeta]) -> Vec<PublishFilePlan> {
        notes.iter().map(|n| {
            let body = strip_frontmatter(&n.content);
            let rel_path = format!("{}/{}.md", astro_dir_for(&n.folder), slugify(&n.title));
            PublishFilePlan {
                rel_path,
                content: format!("{}{}", astro_frontmatter(n), body),
            }
        }).collect()
    }

    fn safety_note(&self) -> Option<String> {
        Some("发布仅新增/覆盖同名 md,绝不删除博客其它文件。请确认你的 Astro 项目用了 glob loader 收集该目录。".to_string())
    }
}

/// 简单 slug:保中文,空白/非法字符转 '-' ;与 `crate::utils::slugify` 对齐的独立实现
fn slugify(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c.is_whitespace() || "_-.".contains(c) { c } else { '-' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_note() -> BijiNoteMeta {
        BijiNoteMeta {
            title: "我的第一篇".to_string(),
            content: "---\nsome: old\n---\n# 我的第一篇\n\nHello 正文。\n".to_string(),
            folder: Some("日记/2026".to_string()),
            tags: vec!["生活".to_string(), "test".to_string()],
            published: Some("2026-08-19".to_string()),
            updated: None,
        }
    }

    #[test]
    fn test_astro_detect_true_on_config() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("astro.config.mjs"), "").unwrap();
        assert!(AstroAdapter.detect(dir.path()));
    }

    #[test]
    fn test_astro_detect_false_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!AstroAdapter.detect(dir.path()));
    }

    #[test]
    fn test_astro_detect_on_content_config() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/content.config.ts"), "").unwrap();
        assert!(AstroAdapter.detect(dir.path()));
    }

    #[test]
    fn test_astro_map_creates_plan_with_frontmatter() {
        let plans = AstroAdapter.map(&[sample_note()]);
        assert_eq!(plans.len(), 1);
        let p = &plans[0];
        assert_eq!(p.rel_path, "posts/我的第一篇.md");
        assert!(p.content.starts_with("---\ntitle: \"我的第一篇\"\n"));
        assert!(p.content.contains("published: 2026-08-19"));
        assert!(p.content.contains("tags: [\"生活\", \"test\"]"));
        // 正文保留(原 frontmatter old 被剥离)
        assert!(p.content.contains("# 我的第一篇"));
        assert!(!p.content.contains("some: old"));
        assert!(p.content.contains("Hello 正文。"));
    }

    #[test]
    fn test_registry_registers_astro_and_get() {
        let reg = CapabilityRegistry::new();
        assert_eq!(reg.all().len(), 1);
        let a = reg.get("astro").expect("应有 astro adapter");
        assert_eq!(a.framework(), "astro");
        assert!(reg.get("hugo").is_none());
        assert!(!reg.is_empty());
    }
}
