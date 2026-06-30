use pulldown_cmark::{html, Options, Parser};

/// 将 Markdown 渲染为 HTML
pub fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

/// 提取 Markdown 中的所有标题（用于大纲）
pub fn extract_headings(markdown: &str) -> Vec<Heading> {
    let mut headings = Vec::new();
    let parser = Parser::new(markdown);

    for event in parser {
        if let pulldown_cmark::Event::Start(ref tag) = event {
            if let pulldown_cmark::Tag::Heading { level, .. } = tag {
                headings.push(Heading {
                    level: *level as u32,
                    text: String::new(),
                });
            }
        }
        if let pulldown_cmark::Event::Text(text) = event {
            if let Some(last) = headings.last_mut() {
                if last.text.is_empty() {
                    last.text = text.to_string();
                }
            }
        }
    }

    headings
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Heading {
    pub level: u32,
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_markdown() {
        let md = "# Hello\n\nThis is **bold**";
        let html = render_markdown(md);
        assert!(html.contains("<h1>"));
        assert!(html.contains("<strong>"));
    }

    #[test]
    fn test_extract_headings() {
        let md = "# Title\n\n## Section 1\n\n### Sub section";
        let headings = extract_headings(md);
        assert_eq!(headings.len(), 3);
        assert_eq!(headings[0].level, 1);
        assert_eq!(headings[1].level, 2);
    }
}
