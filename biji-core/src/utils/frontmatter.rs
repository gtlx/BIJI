use crate::models::NoteFrontmatter;

/// 从 Markdown 内容中解析 YAML frontmatter
pub fn parse_frontmatter(content: &str) -> Option<(NoteFrontmatter, &str)> {
    let content = content.trim();
    if !content.starts_with("---") {
        return None;
    }

    let end = content[3..].find("\n---")?;
    let yaml_str = &content[3..3 + end];
    let body = content[3 + end + 4..].trim();

    let mut frontmatter = NoteFrontmatter::default();

    // which list field we're currently collecting items for
    enum ListTarget { Aliases, Tags }
    let mut in_list: Option<ListTarget> = None;
    let mut pending_key: Option<&str> = None;

    for line in yaml_str.lines() {
        let line = line.trim();
        if line.is_empty() {
            pending_key = None;
            continue;
        }

        // if previous key had empty value, check if this line starts a list
        if let Some(key) = pending_key.take() {
            if let Some(val) = line.strip_prefix("- ") {
                let first = val.trim().to_string();
                match key {
                    "aliases" => {
                        frontmatter.aliases.get_or_insert(Vec::new()).push(first);
                        in_list = Some(ListTarget::Aliases);
                    }
                    "tags" => {
                        frontmatter.tags.get_or_insert(Vec::new()).push(first);
                        in_list = Some(ListTarget::Tags);
                    }
                    _ => {}
                }
                continue;
            }
        }

        // list item continuation
        if let Some(target) = &in_list {
            if let Some(val) = line.strip_prefix("- ") {
                match target {
                    ListTarget::Aliases => {
                        frontmatter.aliases.get_or_insert(Vec::new()).push(val.trim().to_string());
                    }
                    ListTarget::Tags => {
                        frontmatter.tags.get_or_insert(Vec::new()).push(val.trim().to_string());
                    }
                }
                continue;
            }
            in_list = None;
        }

        // key: value pair
        if let Some((key, val)) = line.split_once(':') {
            let key = key.trim();
            let val = val.trim();

            if val.is_empty() {
                pending_key = Some(key);
            } else if val.starts_with('[') && val.ends_with(']') {
                // inline list [a, b, c]
                let items: Vec<String> = val[1..val.len() - 1]
                    .split(',')
                    .map(|s| s.trim().trim_matches('"').trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                match key {
                    "aliases" => frontmatter.aliases = Some(items),
                    "tags" => frontmatter.tags = Some(items),
                    _ => {}
                }
            } else if val == "-" || val.starts_with("- ") {
                // multi-line list starts on this line
                let first = val.trim_start_matches("- ").trim().to_string();
                match key {
                    "aliases" => {
                        frontmatter.aliases.get_or_insert(Vec::new()).push(first);
                        in_list = Some(ListTarget::Aliases);
                    }
                    "tags" => {
                        frontmatter.tags.get_or_insert(Vec::new()).push(first);
                        in_list = Some(ListTarget::Tags);
                    }
                    _ => {}
                }
            } else {
                let val = val.trim_matches('"').to_string();
                match key {
                    "title" => frontmatter.title = Some(val),
                    "created" => frontmatter.created = Some(val),
                    "updated" => frontmatter.updated = Some(val),
                    "completed" => frontmatter.completed = Some(val == "true" || val == "yes"),
                    // [M11 看板] 看板状态(待办/进行中/已完成);字符串透传
                    "status" => frontmatter.status = Some(val),
                    _ => {}
                }
            }
        }
    }

    Some((frontmatter, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_frontmatter() {
        let result = parse_frontmatter("Hello world");
        assert!(result.is_none());
    }

    #[test]
    fn test_basic_frontmatter() {
        let content = "---\ntitle: My Note\ncreated: 2024-01-01\n---\n\n# Hello";
        let (fm, body) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.title.as_deref(), Some("My Note"));
        assert_eq!(fm.created.as_deref(), Some("2024-01-01"));
        assert_eq!(body, "# Hello");
    }

    #[test]
    fn test_inline_list() {
        let content = "---\ntags: [rust, note, app]\n---\n\nBody";
        let (fm, _) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.tags, Some(vec!["rust".into(), "note".into(), "app".into()]));
    }

    #[test]
    fn test_kanban_status() {
        // [M11 看板] status 字段应能被解析出来(看板状态承载于 frontmatter)
        let content = "---\ntitle: 任务\nstatus: 进行中\n---\n\nBody";
        let (fm, _) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.status.as_deref(), Some("进行中"));
        // 无 status 时默认 None
        let plain = parse_frontmatter("---\ntitle: x\n---\n\nB").unwrap().0;
        assert_eq!(plain.status, None);
    }

    #[test]
    fn test_multiline_list() {
        let content = "---\naliases:\n- alias1\n- alias2\n---\n\nBody";
        let (fm, _) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.aliases, Some(vec!["alias1".into(), "alias2".into()]));
    }

    #[test]
    fn test_bool() {
        let content = "---\ncompleted: true\n---\n\nBody";
        let (fm, _) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.completed, Some(true));
    }
}
