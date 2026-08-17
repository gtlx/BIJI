use serde::{Deserialize, Serialize};

/// 块类型(M2 块级存储)
///
/// 对应 PLAN.md 数据模型:段落/标题/列表项等。前端按块渲染、后端按块检索。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    /// 普通段落(连续非空行合并成一个块)
    Paragraph,
    /// 标题(按 # 数量区分级别,内容保留原始 markdown 前缀)
    Heading,
    /// 列表项(无序 -/*/+ 或有序 1. 2. ,一行一项)
    ListItem,
    /// 引用块(连续 > 行合并)
    Quote,
    /// 围栏代码块(``` 包裹,整块合并)
    Code,
    /// 其他(未知类型兜底)
    Other,
}

impl BlockType {
    /// 从字符串解析(数据库存储形态)
    pub fn from_str(s: &str) -> Self {
        match s {
            "heading" => Self::Heading,
            "list_item" => Self::ListItem,
            "quote" => Self::Quote,
            "code" => Self::Code,
            "other" => Self::Other,
            _ => Self::Paragraph,
        }
    }

    /// 转为字符串(数据库存储形态)
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Paragraph => "paragraph",
            Self::Heading => "heading",
            Self::ListItem => "list_item",
            Self::Quote => "quote",
            Self::Code => "code",
            Self::Other => "other",
        }
    }
}

/// 块数据模型(M2 核心)
///
/// 每个块 = {内容, 创建时间, 更新时间, 历史[]};created_at 不可变,updated_at 每次编辑覆盖。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Block {
    pub id: String,
    /// 归属笔记
    pub note_id: String,
    /// 嵌套块父级(本期仅保留字段,不实现子块渲染)
    pub parent_id: Option<String>,
    pub block_type: BlockType,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
    /// 笔记内排序序号(从 0 开始)
    pub sort_order: i64,
}

/// 拆块产物(存储层/迁移用,不含 id 与时间戳)
#[derive(Debug, Clone, PartialEq)]
pub struct BlockDraft {
    pub block_type: BlockType,
    pub content: String,
}

/// 块变更类型(写入 block_history)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeType {
    Create,
    Update,
    Delete,
}

impl ChangeType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "create" => Self::Create,
            "delete" => Self::Delete,
            _ => Self::Update,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Create => "create",
            Self::Update => "update",
            Self::Delete => "delete",
        }
    }
}

/// 块历史快照(M2 灵魂:块时间戳演变)
///
/// 每次变更(create/update/delete)写一条:变更时间 + 内容快照 + 变更类型。
/// 块被硬删后,历史行仍保留(block_id 置 NULL,审计轨迹不丢)。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlockHistory {
    pub id: String,
    /// 块被删除后此字段为 None(历史保留)
    pub block_id: Option<String>,
    pub content_snapshot: String,
    pub changed_at: i64,
    pub change_type: ChangeType,
}

/// 内容模式搜索的块级命中结果
///
/// PLAN.md「全文检索按块返回」:命中块 + 所在笔记 id/标题 + 块内容片段。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlockSearchResult {
    pub block_id: String,
    pub note_id: String,
    pub note_title: String,
    pub content: String,
    pub updated_at: i64,
}

/// [M3.5a 日历热力图] 按日统计的块活跃
///
/// BIJI 灵魂是把块时间戳可视化:某天有多少块被创建 / 被更新,色阶表达写作节奏。
/// `date` 形如 "YYYY-MM-DD"(按本地时区换算);created/updated 为当日计数的块数。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlockActivity {
    pub date: String,
    pub created: i64,
    pub updated: i64,
}

/// [M3.5a 反向链接(块级)] 引用某篇笔记的块
///
/// 与笔记级反向链接不同,这里精确到「哪一段话引用了它」:来源笔记 + 块片段 + 块时间戳。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BlockBacklink {
    /// 引用块 id
    pub block_id: String,
    /// 来源笔记 id
    pub source_note_id: String,
    /// 来源笔记标题
    pub source_note_title: String,
    /// 引用块内容片段(含 [[目标]])
    pub content: String,
    /// 引用块创建时间
    pub created_at: i64,
    /// 引用块更新时间
    pub updated_at: i64,
}

/// [M3.5b 回收站] 回收站中的块(软删后可恢复回原笔记)
///
/// 块模型本身不含 deleted_at(避免大范围改字面量),回收站展示用独立结构,
/// 携带笔记标题 + 删除时间(通常等于块 updated_at 后被软删的时间戳)。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrashBlock {
    pub id: String,
    /// 原归属笔记 id(恢复时写回 note_id)
    pub note_id: String,
    pub parent_id: Option<String>,
    pub block_type: BlockType,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub sort_order: i64,
    /// 原笔记标题(展示用)
    pub note_title: String,
    /// 删除时间
    pub deleted_at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_block_type_roundtrip() {
        for t in [
            BlockType::Paragraph,
            BlockType::Heading,
            BlockType::ListItem,
            BlockType::Quote,
            BlockType::Code,
            BlockType::Other,
        ] {
            assert_eq!(BlockType::from_str(t.as_str()), t);
        }
        assert_eq!(BlockType::from_str("unknown"), BlockType::Paragraph);
    }

    #[test]
    fn test_change_type_roundtrip() {
        for c in [ChangeType::Create, ChangeType::Update, ChangeType::Delete] {
            assert_eq!(ChangeType::from_str(c.as_str()), c);
        }
        assert_eq!(ChangeType::from_str("whatever"), ChangeType::Update);
    }
}
