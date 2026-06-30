use base64::Engine;
use crate::models::{Folder, Note};
use crate::utils::Error;
use std::io::Write;
use std::path::Path;

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
        let re = regex::Regex::new(r"^---\n([\s\S]*?)\n---").unwrap();
        if let Some(caps) = re.captures(content) {
            body = content[caps.get(0).unwrap().end()..].trim().to_string();
        }

        // 第一个 # 标题作为标题
        if let Some(caps) = regex::Regex::new(r"^#\s+(.+)$")
            .unwrap()
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
    get_content: &dyn Fn(&str) -> Result<Option<String>, Error>,
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
