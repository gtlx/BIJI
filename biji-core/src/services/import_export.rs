use base64::Engine;
use crate::models::{Folder, Note};
use crate::utils::Error;
use std::io::Write;
use std::path::Path;
use std::sync::OnceLock;

/// 导入导出服务
pub struct ImportExportService;

impl ImportExportService {
    /// 从 Markdown 目录导入笔记
    pub fn import_from_markdown(
        import_path: &Path,
        save_fn: &mut dyn FnMut(Note) -> Result<(), Error>,
        save_folder_fn: &mut dyn FnMut(Folder) -> Result<(), Error>,
    ) -> Result<ImportResult, Error> {
        let mut count = 0u32;
        Self::process_directory(import_path, None, save_fn, save_folder_fn, &mut count)?;

        Ok(ImportResult {
            success: true,
            count,
            error: None,
        })
    }

    fn process_directory(
        dir: &Path,
        parent_id: Option<String>,
        save_fn: &mut dyn FnMut(Note) -> Result<(), Error>,
        save_folder_fn: &mut dyn FnMut(Folder) -> Result<(), Error>,
        count: &mut u32,
    ) -> Result<(), Error> {
        if !dir.exists() {
            return Ok(());
        }

        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                let folder = Folder {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: entry.file_name().to_string_lossy().to_string(),
                    parent_id: parent_id.clone(),
                    created_at: chrono::Utc::now().timestamp_millis(),
                    color: None,
                    deleted_at: None,
                };
                save_folder_fn(folder.clone())?;
                Self::process_directory(&path, Some(folder.id), save_fn, save_folder_fn, count)?;
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let content = std::fs::read_to_string(&path)?;
                let (title, body) = Self::parse_markdown_file(&content, &path);

                let note = Note {
                    id: uuid::Uuid::new_v4().to_string(),
                    title,
                    content: body,
                    folder_id: parent_id.clone(),
                    created_at: chrono::Utc::now().timestamp_millis(),
                    updated_at: chrono::Utc::now().timestamp_millis(),
                    tags: vec![],
                    is_encrypted: false,
                    sync_status: crate::models::note::SyncStatus::Pending,
                    deleted_at: None,
                    frontmatter: None,
                };
                save_fn(note)?;
                *count += 1;
            }
        }

        Ok(())
    }

    fn parse_markdown_file(content: &str, path: &Path) -> (String, String) {
        let filename = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "untitled".into());

        let mut title = filename.clone();
        let mut body = content.to_string();

        // YAML frontmatter
        static RE_FRONTMATTER: OnceLock<regex::Regex> = OnceLock::new();
        let re = RE_FRONTMATTER.get_or_init(|| regex::Regex::new(r"^---\n([\s\S]*?)\n---").unwrap());
        if let Some(caps) = re.captures(content) {
            body = content[caps.get(0).unwrap().end()..].trim().to_string();
        }

        // 第一个 # 标题作为标题
        static RE_HEADING: OnceLock<regex::Regex> = OnceLock::new();
        if let Some(caps) = RE_HEADING
            .get_or_init(|| regex::Regex::new(r"^#\s+(.+)$").unwrap())
            .captures_iter(content)
            .next()
        {
            title = caps[1].trim().to_string();
            body = body
                .lines()
                .skip_while(|l| l.starts_with("# "))
                .collect::<Vec<&str>>()
                .join("\n")
                .trim()
                .to_string();
        }

        (title, body)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportResult {
    pub success: bool,
    pub count: u32,
    pub error: Option<String>,
}

/// 导出笔记为 ZIP（base64 编码）
pub fn export_notes_zip(
    notes: &[Note],
    _get_content: &dyn Fn(&str) -> Result<Option<String>, Error>,
) -> Result<String, Error> {
    use zip::write::SimpleFileOptions;
    let mut buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let opts =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for note in notes {
            let content = note.content.clone();
            let filename = format!("{}.md", sanitize_filename(&note.title));
            zip.start_file(&filename, opts)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            zip.write_all(content.as_bytes())?;
        }
        zip.finish()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(&buffer))
}

/// 从 ZIP（base64）导入笔记
pub fn import_notes_zip(
    base64_data: &str,
    save_fn: &mut dyn FnMut(Note) -> Result<(), Error>,
) -> Result<ImportResult, Error> {
    use std::io::Read;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| Error::General(format!("Base64 decode: {}", e)))?;
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| Error::General(format!("ZIP parse: {}", e)))?;
    let mut count = 0u32;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| Error::General(format!("ZIP entry: {}", e)))?;
        if !file.name().ends_with(".md") {
            continue;
        }
        let mut content = String::new();
        file.read_to_string(&mut content)?;
        let title = file.name().trim_end_matches(".md").to_string();
        let note = Note {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            content,
            folder_id: None,
            created_at: chrono::Utc::now().timestamp_millis(),
            updated_at: chrono::Utc::now().timestamp_millis(),
            tags: vec![],
            is_encrypted: false,
            sync_status: crate::models::note::SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        };
        save_fn(note)?;
        count += 1;
    }
    Ok(ImportResult {
        success: true,
        count,
        error: None,
    })
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

// ============================================================
// [M3.5b 导出增强] 单笔记导出:干净 .md 与可打印 HTML(浏览器可「打印为 PDF」)
// ============================================================

/// [M3.5b] 单笔记导出 Markdown 内容(纯 .md 正文,不含 zip 包装)
pub fn export_note_markdown(note: &Note) -> String {
    // 正文已以一级标题开头(如 frontmatter 后就是 # 标题)则原样返回,否则补一行标题
    if note.content.trim_start().starts_with("# ") {
        note.content.trim_end().to_string() + "\n"
    } else {
        format!("# {}\n\n{}", note.title, note.content.trim_end()).trim_end().to_string() + "\n"
    }
}

/// [M3.5b] 把 markdown 渲染成 HTML(段落/标题/列表/引用/代码/表格/行内标记)
///
/// 用 pulldown-cmark 解析,禁用 raw html / 图片以规避注入,输出干净内联 HTML。
pub fn render_markdown_to_html(md: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    let parser = Parser::new_ext(md, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

/// [M3.5b] 单笔记导出为完整可打印 HTML(自带打印 CSS,浏览器可直接「打印为 PDF」)
///
/// 结构:<html><head>内联样式</head><body>标题 + 元信息 + 渲染正文</body>。
/// PDF 实现取舍:后端不引入重渲染引擎,导出干净 HTML 文件,由浏览器打印为 PDF。
pub fn export_note_html(note: &Note) -> String {
    let body_html = render_markdown_to_html(&note.content);
    let updated = chrono::DateTime::from_timestamp_millis(note.updated_at)
        .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_default();
    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: light dark; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    max-width: 820px; margin: 0 auto; padding: 40px 32px; line-height: 1.75;
    font-size: 16px; color: #1f2d2b; background: #fff;
  }}
  h1 {{ font-size: 1.8em; border-bottom: 2px solid #26a69a; padding-bottom: .3em; }}
  h2 {{ font-size: 1.4em; margin-top: 1.4em; }}
  h3 {{ font-size: 1.2em; }}
  a {{ color: #00897b; }}
  code {{ background: #eef4f3; padding: .15em .35em; border-radius: 4px; font-size: .92em; }}
  pre {{ background: #f4f8f7; padding: 14px; border-radius: 8px; overflow-x: auto; }}
  pre code {{ background: none; padding: 0; }}
  blockquote {{ border-left: 4px solid #26a69a; margin: 1em 0; padding: .2em 1em; color: #5a6a67; background: #f7fbfa; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #d5e2e0; padding: 6px 10px; }}
  th {{ background: #eef6f4; }}
  .biji-meta {{ color: #7a8a87; font-size: .88em; margin-bottom: 24px; }}
  hr {{ border: none; border-top: 1px solid #dbe7e5; margin: 2em 0; }}
  @media print {{
    body {{ padding: 0; max-width: none; color: #000; }}
    .biji-meta {{ color: #555; }}
  }}
  @media (prefers-color-scheme: dark) {{
    body {{ color: #ddece9; background: #0f1716; }}
    code, pre {{ background: #16211f; }}
    blockquote {{ background: #131d1b; color: #a9c4be; }}
    th {{ background: #1a2623; }} th, td {{ border-color: #2a3a36; }}
    hr {{ border-top-color: #2a3a36; }}
  }}
</style>
</head>
<body>
<h1>{title}</h1>
<div class="biji-meta">导出于 {updated} · Biji Note</div>
<article>
{body}
</article>
</body>
</html>"#,
        title = note.title,
        updated = updated,
        body = body_html,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SyncStatus;

    fn make_note(title: &str, content: &str) -> Note {
        Note {
            id: uuid::Uuid::new_v4().to_string(),
            title: title.to_string(),
            content: content.to_string(),
            folder_id: None,
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_100_000,
            tags: vec![],
            is_encrypted: false,
            sync_status: SyncStatus::Pending,
            deleted_at: None,
            frontmatter: None,
        }
    }

    #[test]
    fn test_export_note_markdown_prepends_title_when_missing() {
        let note = make_note("我的标题", "第一段\n\n第二段。");
        let md = export_note_markdown(&note);
        assert!(md.starts_with("# 我的标题"));
        assert!(md.contains("第一段"));
    }

    #[test]
    fn test_export_note_markdown_keeps_existing_heading() {
        let note = make_note("我的标题", "# 已有标题\n\n正文");
        let md = export_note_markdown(&note);
        // 已有 # 标题则不重复插入标题行
        assert!(md.starts_with("# 已有标题"));
        assert!(!md.contains("# 我的标题"));
    }

    #[test]
    fn test_render_markdown_to_html_converts_blocks() {
        let html = render_markdown_to_html("# 标题\n\n段落 **加粗**。\n\n- 列表项\n\n> 引用");
        assert!(html.contains("<h1>标题</h1>"));
        assert!(html.contains("<strong>加粗</strong>"));
        assert!(html.contains("<li>列表项</li>"));
        assert!(html.contains("<blockquote>"));
    }

    #[test]
    fn test_export_note_html_is_standalone_printable() {
        let note = make_note("导出测试", "# 一级\n\n正文内容");
        let doc = export_note_html(&note);
        // 完整文档结构:doctype + title + 样式 + 标题 + 正文
        assert!(doc.starts_with("<!DOCTYPE html>"));
        assert!(doc.contains("<title>导出测试</title>"));
        assert!(doc.contains("print"));
        assert!(doc.contains("<h1>一级</h1>"));
        assert!(doc.contains("正文内容"));
        assert!(doc.contains("<html lang=\"zh-CN\">"));
    }
}
