use crate::services::CapabilityRegistry;
use crate::utils::Error;
use std::path::Path;
use std::process::Command;

/// 静态站点发布服务
pub struct PublishService {
    notes_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PublishConfig {
    /// 发布目标目录(运行时填入)。若提供,则把笔记导出为 md 写入该目录,
    /// 交给用户自己的博客框架构建 —— 不绑定任何生成器。
    #[serde(default)]
    pub target_dir: Option<String>,
    /// 旧字段:自建站点时的输出父目录(仅当 target_dir 为空且走生成器构建时用)
    #[serde(default)]
    pub output_path: Option<String>,
    /// 旧字段:自建站点用的生成器;target_dir 提供时忽略
    #[serde(default)]
    pub generator: Option<StaticSiteGenerator>,
    #[serde(default)]
    pub site_name: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum StaticSiteGenerator {
    Hugo,
    Astro,
    VitePress,
}

impl StaticSiteGenerator {
    /// 展示名(中文,前端向导/错误提示用)
    pub fn name(&self) -> &'static str {
        match self {
            StaticSiteGenerator::Hugo => "Hugo",
            StaticSiteGenerator::Astro => "Astro",
            StaticSiteGenerator::VitePress => "VitePress",
        }
    }

    /// 对应可执行命令名
    pub fn command(&self) -> &'static str {
        match self {
            StaticSiteGenerator::Hugo => "hugo",
            StaticSiteGenerator::Astro => "astro",
            StaticSiteGenerator::VitePress => "vitepress",
        }
    }
}

impl PublishService {
    pub fn new(notes_path: &Path) -> Self {
        Self {
            notes_path: notes_path.to_string_lossy().to_string(),
        }
    }

    /// 检查生成器是否可用
    pub fn check_generator(
        &self,
        generator: &StaticSiteGenerator,
    ) -> Result<(bool, Option<String>), Error> {
        let cmd = generator.command();

        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg(cmd).output()?
        } else {
            Command::new("which").arg(cmd).output()?
        };

        if output.status.success() {
            let version_output = Command::new(cmd).arg("--version").output().ok();
            let version = version_output
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|s| {
                    regex::Regex::new(r"v?[\d.]+")
                        .ok()
                        .and_then(|re| re.find(&s).map(|m| m.as_str().to_string()))
                });
            Ok((true, version))
        } else {
            Ok((false, None))
        }
    }

    /// 执行发布
    ///
    /// - 若 `config.target_dir` 提供:通过**能力注册表**找博客框架适配器,
    ///   识别目标目录结构 → `map` 生成文件计划 → 写盘(不绑定数字生成器)。
    ///   `registry`:能力注册表(持有 PublishAdapter,如 Astro)。
    /// - 否则走旧的「自建站点 + 生成器构建」流程(兼容 M4)。
    pub fn publish(&self, config: &PublishConfig, registry: &CapabilityRegistry) -> Result<PublishResult, Error> {
        // ① 主路径:发布到用户指定的现有博客目录(走框架适配器能力路径)
        if let Some(target) = config.target_dir.as_deref() {
            if target.trim().is_empty() {
                return Ok(PublishResult {
                    success: false,
                    output_path: None,
                    error: Some("发布目标目录为空。请填写你现有博客的 content/md 目录路径。".into()),
                });
            }
            let dir = Path::new(target);
            // 用能力注册表识别框架:优先 astro(当前唯一内置),自动检测
            let adapter = registry.get("astro");
            let (framework, plans) = match adapter {
                Some(ad) => {
                    let detect = ad.detect_info(dir);
                    let notes = self.get_all_notes_meta()?;
                    let plans = ad.map(&notes);
                    (ad.framework().to_string(), plans)
                }
                None => {
                    // 无适配器:回退平铺导出(仍可用,但不带主题结构能力)
                    let _n = self.write_notes_to(dir)?;
                    return Ok(PublishResult {
                        success: true,
                        output_path: Some(dir.to_string_lossy().to_string()),
                        error: None,
                    });
                }
            };
            // 写盘:计划 → 目标目录
            for plan in &plans {
                let dest = dir.join(&plan.rel_path);
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&dest, &plan.content)?;
            }
            return Ok(PublishResult {
                success: true,
                output_path: Some(dir.to_string_lossy().to_string()),
                error: None,
            });
        }

        // ② 兼容旧路径:自建站点 + 生成器构建
        let gen = match &config.generator {
            Some(g) => g.clone(),
            None => {
                return Ok(PublishResult {
                    success: false,
                    output_path: None,
                    error: Some("未指定发布方式:请提供 target_dir(发布到现有博客目录)或 generator(自建站点构建)。".into()),
                });
            }
        };
        match self.check_generator(&gen)? {
            (false, _) => {
                return Ok(PublishResult {
                    success: false,
                    output_path: None,
                    error: Some(format!(
                        "静态站点生成器 {} 未安装或不在 PATH。请先安装后重试,或改用 target_dir 发布到现有博客目录。",
                        gen.name()
                    )),
                });
            }
            _ => {}
        }
        let out = config.output_path.as_deref().unwrap_or_default();
        let legacy = PublishConfig {
            target_dir: None,
            output_path: Some(out.to_string()),
            generator: Some(gen.clone()),
            site_name: config.site_name.clone(),
            base_url: config.base_url.clone(),
        };
        match gen {
            StaticSiteGenerator::Hugo => self.publish_hugo(&legacy),
            StaticSiteGenerator::Astro => self.publish_astro(&legacy),
            StaticSiteGenerator::VitePress => self.publish_vitepress(&legacy),
        }
    }

    fn publish_hugo(&self, config: &PublishConfig) -> Result<PublishResult, Error> {
        let site_path = Path::new(config.output_path.as_deref().unwrap_or_default()).join("site");
        if !site_path.exists() {
            Command::new("hugo")
                .args(["new", "site"])
                .arg(&site_path)
                .output()?;
        }

        let content_path = site_path.join("content");
        std::fs::create_dir_all(&content_path)?;

        let notes = self.get_all_notes()?;
        for note in &notes {
            let filename = format!("{}.md", crate::utils::slugify(&note.title));
            std::fs::write(content_path.join(&filename), &note.content)?;
        }

        // 写 hugo 配置
        let config_content = format!(
            r#"baseURL = "{}"
languageCode = "zh-cn"
title = "{}"
theme = "ananke"
"#,
            config.base_url.as_deref().unwrap_or("/"),
            config.site_name.as_deref().unwrap_or("My Notes"),
        );
        std::fs::write(site_path.join("hugo.toml"), config_content)?;

        let output = Command::new("hugo")
            .args(["-d", "public"])
            .current_dir(&site_path)
            .output()?;

        if output.status.success() {
            Ok(PublishResult {
                success: true,
                output_path: Some(site_path.join("public").to_string_lossy().to_string()),
                error: None,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(PublishResult {
                success: false,
                output_path: None,
                error: Some(stderr),
            })
        }
    }

    fn publish_astro(&self, config: &PublishConfig) -> Result<PublishResult, Error> {
        let site_path = Path::new(config.output_path.as_deref().unwrap_or_default()).join("site");
        if !site_path.exists() {
            std::fs::create_dir_all(&site_path)?;
            // 简化：创建基本的 Astro 项目结构
            std::fs::write(
                site_path.join("package.json"),
                r#"{"name":"biji-astro","type":"module","scripts":{"build":"astro build"}}"#,
            )?;
        }

        let src_path = site_path.join("src/pages");
        std::fs::create_dir_all(&src_path)?;

        let notes = self.get_all_notes()?;
        for note in &notes {
            let filename = format!("{}.md", crate::utils::slugify(&note.title));
            std::fs::write(src_path.join(&filename), &note.content)?;
        }

        let output = Command::new("npm")
            .args(["run", "build"])
            .current_dir(&site_path)
            .output()?;

        if output.status.success() {
            Ok(PublishResult {
                success: true,
                output_path: Some(site_path.join("dist").to_string_lossy().to_string()),
                error: None,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(PublishResult {
                success: false,
                output_path: None,
                error: Some(stderr),
            })
        }
    }

    fn publish_vitepress(&self, config: &PublishConfig) -> Result<PublishResult, Error> {
        let site_path = Path::new(config.output_path.as_deref().unwrap_or_default()).join("site");
        let docs_path = site_path.join("docs");
        std::fs::create_dir_all(&docs_path)?;

        let notes = self.get_all_notes()?;
        for note in &notes {
            let filename = format!("{}.md", crate::utils::slugify(&note.title));
            std::fs::write(docs_path.join(&filename), &note.content)?;
        }

        // 首页
        std::fs::write(
            docs_path.join("index.md"),
            format!("# {}", config.site_name.as_deref().unwrap_or("My Notes")),
        )?;

        let output = Command::new("npx")
            .args(["vitepress", "build", "docs"])
            .current_dir(&site_path)
            .output()?;

        if output.status.success() {
            Ok(PublishResult {
                success: true,
                output_path: Some(
                    site_path
                        .join(".vitepress/dist")
                        .to_string_lossy()
                        .to_string(),
                ),
                error: None,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(PublishResult {
                success: false,
                output_path: None,
                error: Some(stderr),
            })
        }
    }

    fn get_all_notes(&self) -> Result<Vec<SimpleNote>, Error> {
        let mut notes = Vec::new();
        self.walk_dir(Path::new(&self.notes_path), &mut notes)?;
        Ok(notes)
    }

    /// [2026-08-19 插件化] 取全部笔记为 `BijiNoteMeta`(供 PublishAdapter::map 用)。
    /// 文件名/相对路径 → title/folder;frontmatter 里若有 tags/date 顺带解析。
    fn get_all_notes_meta(&self) -> Result<Vec<crate::services::BijiNoteMeta>, Error> {
        use crate::services::BijiNoteMeta;
        let mut out = Vec::new();
        self.walk_meta(Path::new(&self.notes_path), String::new(), &mut out)?;
        let _ = out.len();
        Ok(out)
    }

    /// [插件化] 递归收集笔记元数据,`rel_dir` 为相对父目录(从 notes_path 起)。
    fn walk_meta(&self, dir: &Path, rel_dir: String, out: &mut Vec<crate::services::BijiNoteMeta>) -> Result<(), Error> {
        use crate::services::BijiNoteMeta;
        if !dir.exists() {
            return Ok(());
        }
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let sub = if rel_dir.is_empty() {
                    entry.file_name().to_string_lossy().to_string()
                } else {
                    format!("{}/{}", rel_dir, entry.file_name().to_string_lossy())
                };
                self.walk_meta(&path, sub, out)?;
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let content = std::fs::read_to_string(&path)?;
                let title = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                out.push(BijiNoteMeta {
                    title,
                    content,
                    folder: if rel_dir.is_empty() { None } else { Some(rel_dir.clone()) },
                    tags: Vec::new(),
                    published: None,
                    updated: None,
                });
            }
        }
        Ok(())
    }

    /// [M4] 把导出 md 文件夹的笔记写入站点内容子目录(纯文件逻辑,可单测,无需真实生成器)
    ///
    /// 返回写入的笔记数;已存在的同名文件会被覆盖(增量重新导出)。
    pub fn write_notes_to(&self, dir: &Path) -> Result<usize, Error> {
        std::fs::create_dir_all(dir)?;
        let notes = self.get_all_notes()?;
        for note in &notes {
            let filename = format!("{}.md", crate::utils::slugify(&note.title));
            std::fs::write(dir.join(&filename), &note.content)?;
        }
        Ok(notes.len())
    }

    fn walk_dir(&self, dir: &Path, notes: &mut Vec<SimpleNote>) -> Result<(), Error> {
        if !dir.exists() {
            return Ok(());
        }
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                self.walk_dir(&path, notes)?;
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let content = std::fs::read_to_string(&path)?;
                let title = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                notes.push(SimpleNote { title, content });
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PublishResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

struct SimpleNote {
    title: String,
    content: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_sample_md(dir: &Path) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(
            dir.join("第一篇.md"),
            "# 第一篇\n\n正文内容。\n",
        )
        .unwrap();
        std::fs::write(dir.join("第二篇.md"), "# 第二篇\n\n另一篇正文。\n").unwrap();
    }

    /// 生成器未安装时 check_generator 返回 (false, None),不崩溃
    #[test]
    fn test_check_generator_absent_returns_false() {
        let dir = tempfile::tempdir().unwrap();
        let svc = PublishService::new(dir.path());
        for gen in [StaticSiteGenerator::Hugo, StaticSiteGenerator::Astro, StaticSiteGenerator::VitePress] {
            let (available, _version) = svc.check_generator(&gen).unwrap();
            // arch 虚拟机未装这三个生成器,应如实报未可用
            assert_eq!(available, false);
        }
    }

    /// 生成器缺失时 publish 降级返回(不崩溃、报错提示),而不是触发 "Command not found" panic
    #[test]
    fn test_publish_degrades_gracefully_when_generator_missing() {
        let dir = tempfile::tempdir().unwrap();
        write_sample_md(dir.path());
        let svc = PublishService::new(dir.path());
        let registry = CapabilityRegistry::new();
        let config = PublishConfig {
            target_dir: None,
            output_path: Some(dir.path().join("out").to_string_lossy().to_string()),
            generator: Some(StaticSiteGenerator::Hugo),
            site_name: Some("测试".into()),
            base_url: None,
        };
        let result = svc.publish(&config, &registry).unwrap();
        assert_eq!(result.success, false);
        assert!(result.output_path.is_none());
        let err = result.error.expect("缺生成器应返回错误信息");
        assert!(err.contains("Hugo"), "错误应带生成器名: {err}");
        assert!(err.contains("未安装"), "错误应提示未安装: {err}");
    }

    /// [2026-08-19] 主路径:提供 target_dir 时,把笔记导出为 md 写入该目录,不绑生成器
    #[test]
    fn test_publish_to_target_dir_writes_md_without_generator() {
        let dir = tempfile::tempdir().unwrap();
        write_sample_md(dir.path());
        let svc = PublishService::new(dir.path());
        let registry = CapabilityRegistry::new();
        let target = dir.path().join("blog/content");
        let config = PublishConfig {
            target_dir: Some(target.to_string_lossy().to_string()),
            output_path: None,
            generator: None,
            site_name: None,
            base_url: None,
        };
        let result = svc.publish(&config, &registry).unwrap();
        assert_eq!(result.success, true, "target_dir 发布应成功: {:?}", result.error);
        assert!(result.error.is_none());
        let out = result.output_path.expect("应返回输出目录");
        assert_eq!(out, target.to_string_lossy());
        // 走 Astro 适配器:md 写入 posts/ 子目录(带 frontmatter)
        assert!(target.join("posts/第一篇.md").exists());
        assert!(target.join("posts/第二篇.md").exists());
    }

    /// [2026-08-19] target_dir 为空/缺失 → 报错,给用户明确指引
    #[test]
    fn test_publish_empty_target_dir_returns_guidance() {
        let dir = tempfile::tempdir().unwrap();
        write_sample_md(dir.path());
        let svc = PublishService::new(dir.path());
        let registry = CapabilityRegistry::new();
        let config = PublishConfig {
            target_dir: Some("   ".to_string()),
            output_path: None,
            generator: None,
            site_name: None,
            base_url: None,
        };
        let result = svc.publish(&config, &registry).unwrap();
        assert_eq!(result.success, false);
        let err = result.error.expect("空目录应报错");
        assert!(err.contains("发布目标目录为空"), "应提示目标目录为空: {err}");
        // None + 无 target_dir → 提示二选一
        let config2 = PublishConfig {
            target_dir: None,
            output_path: None,
            generator: None,
            site_name: None,
            base_url: None,
        };
        let result2 = svc.publish(&config2, &registry).unwrap();
        assert_eq!(result2.success, false);
        assert!(result2.error.as_deref().unwrap_or("").contains("未指定发布方式"));
    }

    /// write_notes_to:把导出 md 文件夹写入站点内容子目录(纯文件逻辑,无需真实生成器)
    #[test]
    fn test_write_notes_to_output_subdir() {
        let dir = tempfile::tempdir().unwrap();
        write_sample_md(dir.path());
        let svc = PublishService::new(dir.path());
        let out = dir.path().join("site/content");
        let n = svc.write_notes_to(&out).unwrap();
        assert_eq!(n, 2);
        assert!(out.join("第一篇.md").exists());
        assert!(out.join("第二篇.md").exists());
    }

    /// name()/command() 必成对可用(前端向导/错误提示依赖)
    #[test]
    fn test_generator_name_and_command() {
        assert_eq!(StaticSiteGenerator::Hugo.name(), "Hugo");
        assert_eq!(StaticSiteGenerator::Hugo.command(), "hugo");
        assert_eq!(StaticSiteGenerator::Astro.command(), "astro");
        assert_eq!(StaticSiteGenerator::VitePress.command(), "vitepress");
    }
}


