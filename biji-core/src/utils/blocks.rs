use crate::models::{BlockDraft, BlockType};
use crate::utils::frontmatter::parse_frontmatter;

/// 拆块规则(M2 核心算法,纯函数)
///
/// 把一篇笔记的 markdown 内容拆成块序列(Logseq 块级思想):
/// - 前置 frontmatter 剥离(元数据不进块)
/// - 空行是块分隔符
/// - 每个标题行 = 一个 heading 块(保留 `# ` 前缀,便于合并/导出)
/// - 每个列表项行 = 一个 list_item 块
/// - 连续引用行(`>`)合并为一个 quote 块
/// - 围栏代码块(``` ```)整体为一个 code 块
/// - 其余连续非空行合并为一个 paragraph 块(整段替换 = 一个 update,盖一个时间戳)
///
/// 迁移(002)与块服务(sync_note_blocks)共用本函数,保证拆块规则唯一。
pub fn split_markdown_blocks(content: &str) -> Vec<BlockDraft> {
    let body = strip_frontmatter(content);
    let lines: Vec<&str> = body.lines().collect();
    let mut drafts: Vec<BlockDraft> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];

        // 空行:分隔符,跳过
        if line.trim().is_empty() {
            i += 1;
            continue;
        }

        // 围栏代码块:从 ``` 开始收集到下一个 ``` 或结尾
        if is_fence(line) {
            let fence = line;
            let mut code_lines = vec![fence];
            i += 1;
            while i < lines.len() && !is_fence(lines[i]) {
                code_lines.push(lines[i]);
                i += 1;
            }
            if i < lines.len() {
                code_lines.push(lines[i]); // 收尾 ``` 行
                i += 1;
            }
            drafts.push(BlockDraft {
                block_type: BlockType::Code,
                content: code_lines.join("\n"),
            });
            continue;
        }

        // 标题:单行成块
        if is_heading(line) {
            drafts.push(BlockDraft {
                block_type: BlockType::Heading,
                content: line.to_string(),
            });
            i += 1;
            continue;
        }

        // 列表项:单行成块(支持有序/无序/任务列表)
        if is_list_item(line) {
            drafts.push(BlockDraft {
                block_type: BlockType::ListItem,
                content: line.to_string(),
            });
            i += 1;
            continue;
        }

        // 引用:连续引用行合并为一个块
        if line.starts_with('>') {
            let mut quote_lines = vec![line];
            i += 1;
            while i < lines.len() {
                let l = lines[i];
                if l.starts_with('>') {
                    quote_lines.push(l);
                    i += 1;
                } else if l.trim().is_empty() {
                    // 引用中间空行:结束当前引用块(空行之后重新判定)
                    break;
                } else {
                    break;
                }
            }
            drafts.push(BlockDraft {
                block_type: BlockType::Quote,
                content: quote_lines.join("\n"),
            });
            continue;
        }

        // 普通段落:连续非空行合并为一个块
        let mut para_lines = vec![line];
        i += 1;
        while i < lines.len() {
            let l = lines[i];
            if l.trim().is_empty() || is_heading(l) || is_list_item(l) || is_fence(l) || l.starts_with('>') {
                break;
            }
            para_lines.push(l);
            i += 1;
        }
        drafts.push(BlockDraft {
            block_type: BlockType::Paragraph,
            content: para_lines.join("\n"),
        });
    }

    drafts
}

/// 剥离 YAML frontmatter(元数据不进块,保持内容完整性)
fn strip_frontmatter(content: &str) -> &str {
    match parse_frontmatter(content) {
        Some((_, body)) => body,
        None => content.trim_start(),
    }
}

/// 根据单块内容推断块类型(create/update 时与内容保持唯一来源)
pub fn detect_block_type(content: &str) -> BlockType {
    let first_line = content.lines().next().unwrap_or("");
    if is_fence(first_line) {
        BlockType::Code
    } else if is_heading(first_line) {
        BlockType::Heading
    } else if is_list_item(first_line) {
        BlockType::ListItem
    } else if first_line.starts_with('>') {
        BlockType::Quote
    } else {
        BlockType::Paragraph
    }
}

fn is_fence(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with("```") || t.starts_with("~~~")
}

fn is_heading(line: &str) -> bool {
    let t = line.trim_start();
    if !t.starts_with('#') {
        return false;
    }
    // 防误判:###xxx(不是标题),# 后必须有空格或行尾
    let hashes = t.chars().take_while(|c| *c == '#').count();
    hashes <= 6 && (t.len() == hashes || t.as_bytes()[hashes] == b' ' || t.as_bytes()[hashes] == b'\t')
}

fn is_list_item(line: &str) -> bool {
    let t = line.trim_start();
    // 无序列表: - * + 后跟空格
    for marker in ['-', '*', '+'] {
        if let Some(rest) = t.strip_prefix(marker) {
            if rest.starts_with(' ') {
                return true;
            }
        }
    }
    // 任务列表: - [ ] / - [x]
    // 有序列表: 1. 2. 等
    let mut chars = t.chars();
    let mut digits = 0;
    for c in chars.by_ref() {
        if c.is_ascii_digit() {
            digits += 1;
        } else {
            break;
        }
    }
    if digits > 0 && t.as_bytes().get(digits) == Some(&b'.') {
        let after = t.as_bytes().get(digits + 1);
        return after == Some(&b' ') || after == Some(&b'\t');
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn types(drafts: &[BlockDraft]) -> Vec<BlockType> {
        drafts.iter().map(|d| d.block_type).collect()
    }

    #[test]
    fn test_split_headings_and_paragraphs() {
        let md = "# 标题一\n\n这是第一段。\n这是第一段续行。\n\n## 标题二\n\n第二段内容。";
        let drafts = split_markdown_blocks(md);
        assert_eq!(types(&drafts), vec![
            BlockType::Heading,
            BlockType::Paragraph,
            BlockType::Heading,
            BlockType::Paragraph,
        ]);
        // 段落合并连续行
        assert_eq!(drafts[1].content, "这是第一段。\n这是第一段续行。");
        // 标题保留原始前缀
        assert_eq!(drafts[0].content, "# 标题一");
    }

    #[test]
    fn test_split_list_items() {
        let md = "- 第一项\n- 第二项\n\n1. 有序一\n2. 有序二\n\n- [ ] 任务一";
        let drafts = split_markdown_blocks(md);
        assert_eq!(types(&drafts), vec![
            BlockType::ListItem,
            BlockType::ListItem,
            BlockType::ListItem,
            BlockType::ListItem,
            BlockType::ListItem,
        ]);
        assert_eq!(drafts[0].content, "- 第一项");
        assert_eq!(drafts[2].content, "1. 有序一");
        assert_eq!(drafts[4].content, "- [ ] 任务一");
    }

    #[test]
    fn test_split_code_fence() {
        let md = "正文前。\n\n```rust\nfn main() {}\n```\n\n正文后。";
        let drafts = split_markdown_blocks(md);
        assert_eq!(types(&drafts), vec![
            BlockType::Paragraph,
            BlockType::Code,
            BlockType::Paragraph,
        ]);
        assert_eq!(drafts[1].content, "```rust\nfn main() {}\n```");
    }

    #[test]
    fn test_split_quote() {
        let md = "> 引用第一行\n> 引用第二行\n\n普通段落。";
        let drafts = split_markdown_blocks(md);
        assert_eq!(types(&drafts), vec![BlockType::Quote, BlockType::Paragraph]);
        assert_eq!(drafts[0].content, "> 引用第一行\n> 引用第二行");
    }

    #[test]
    fn test_split_strips_frontmatter() {
        let md = "---\ntitle: 测试\n---\n\n# 正文标题\n\n正文内容。";
        let drafts = split_markdown_blocks(md);
        assert_eq!(types(&drafts), vec![BlockType::Heading, BlockType::Paragraph]);
        assert_eq!(drafts[0].content, "# 正文标题");
    }

    #[test]
    fn test_split_empty_and_blank() {
        assert!(split_markdown_blocks("").is_empty());
        assert!(split_markdown_blocks("\n\n  \n").is_empty());
        assert_eq!(split_markdown_blocks("仅一段").len(), 1);
    }

    #[test]
    fn test_heading_without_space_not_misdetected() {
        // ###xxx 不是标题,应并入段落
        let md = "###不是标题\n第二行";
        let drafts = split_markdown_blocks(md);
        assert_eq!(types(&drafts), vec![BlockType::Paragraph]);
    }
}
