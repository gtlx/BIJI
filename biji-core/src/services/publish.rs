use crate::utils::Error;
use std::path::Path;
use std::process::Command;

/// 静态站点发布服务
pub struct PublishService {
    notes_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PublishConfig {
    pub output_path: String,
    pub generator: StaticSiteGenerator,
    pub site_name: Option<String>,
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
    /// [M4] 先检查生成器可用性:缺失时降级返回(不崩溃、不残留半成品),错误信息提示如何安装。
    pub fn publish(&self, config: &PublishConfig) -> Result<PublishResult, Error> {
        // 生成器缺失:直接降级失败返回,避免 "Command not found" 崩溃,也说明真实生成需 M6/终端执行
        match self.check_generator(&config.generator)? {
            (false, _) => {
                return Ok(PublishResult {
                    success: false,
                    output_path: None,
                    error: Some(format!(
                        "静态站点生成器 {} 未安装或不在 PATH。请先安装后重试(真实生成依赖 M6/Tauri 壳或终端执行)。",
                        config.generator.name()
                    )),
                });
            }
            _ => {}
        }
        match config.generator {
            StaticSiteGenerator::Hugo => self.publish_hugo(config),
            StaticSiteGenerator::Astro => self.publish_astro(config),
            StaticSiteGenerator::VitePress => self.publish_vitepress(config),
        }
    }

    fn publish_hugo(&self, config: &PublishConfig) -> Result<PublishResult, Error> {
        let site_path = Path::new(&config.output_path).join("site");
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
        let site_path = Path::new(&config.output_path).join("site");
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
        let site_path = Path::new(&config.output_path).join("site");
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
        let config = PublishConfig {
            output_path: dir.path().join("out").to_string_lossy().to_string(),
            generator: StaticSiteGenerator::Hugo,
            site_name: Some("测试".into()),
            base_url: None,
        };
        let result = svc.publish(&config).unwrap();
        assert_eq!(result.success, false);
        assert!(result.output_path.is_none());
        let err = result.error.expect("缺生成器应返回错误信息");
        assert!(err.contains("Hugo"), "错误应带生成器名: {err}");
        assert!(err.contains("未安装"), "错误应提示未安装: {err}");
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


