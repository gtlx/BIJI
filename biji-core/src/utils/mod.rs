pub mod errors;
pub mod frontmatter;
pub mod markdown;
pub mod wikilink;

pub use errors::*;
pub use frontmatter::*;
pub use markdown::*;
pub use wikilink::*;

/// 将文本转为 slug（小写字母数字 + 下划线）
pub fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>()
        .trim()
        .replace(' ', "_")
        .replace("__", "_")
}
