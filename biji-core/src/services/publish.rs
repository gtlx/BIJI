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
        let cmd = match generator {
            StaticSiteGenerator::Hugo => "hugo",
            StaticSiteGenerator::Astro => "astro",
            StaticSiteGenerator::VitePress => "vitepress",
        };

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
    pub fn publish(&self, config: &PublishConfig) -> Result<PublishResult, Error> {
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


