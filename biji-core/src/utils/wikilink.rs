use regex::Regex;
use std::sync::OnceLock;

/// 解析 Markdown 中的 [[Wiki 链接]]
pub fn parse_wikilinks(content: &str) -> Vec<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").unwrap());

    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

/// 替换 [[链接]] 为 HTML 链接（用于预览）
pub fn replace_wikilinks(content: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").unwrap());

    re.replace_all(content, |caps: &regex::Captures| {
        let title = &caps[1];
        let escaped = title.replace('"', "&quot;");
        format!(
            r##"<a href="#" class="wikilink" data-title="{}">{}</a>"##,
            escaped, escaped
        )
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wikilinks() {
        let content = "这是一条[[链接]]和[[另一个链接]]";
        let links = parse_wikilinks(content);
        assert_eq!(links, vec!["链接", "另一个链接"]);
    }

    #[test]
    fn test_no_links() {
        let content = "没有任何链接的文本";
        let links = parse_wikilinks(content);
        assert!(links.is_empty());
    }
}
