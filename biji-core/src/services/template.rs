use crate::database::Database;
use crate::models::NoteTemplate;
use crate::utils::Error;
use std::sync::Arc;
use uuid::Uuid;

/// [M3.5b 笔记模板] 模板服务(业务层)
///
/// 内置模板由迁移种入(不可删改),用户可新增自定义模板。
/// `render` 把模板内容中的 `{{date}}` 占位符替换为当天日期。
pub struct TemplateService {
    db: Arc<Database>,
}

impl TemplateService {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// 列出全部模板(内置在前)
    pub fn list_templates(&self) -> Result<Vec<NoteTemplate>, Error> {
        self.db.list_templates()
    }

    /// 按 id 取单个模板
    pub fn get_template(&self, id: &str) -> Result<Option<NoteTemplate>, Error> {
        self.db.get_template(id)
    }

    /// 新增用户模板(自动生成 id、打 created_at)
    pub fn create_template(&self, name: &str, content: &str) -> Result<NoteTemplate, Error> {
        let tpl = NoteTemplate {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            category: "custom".into(),
            content: content.to_string(),
            is_builtin: false,
            created_at: chrono::Utc::now().timestamp_millis(),
        };
        self.db.insert_template(&tpl)?;
        Ok(tpl)
    }

    /// 更新自定义模板;内置模板返回 false(不改)
    pub fn update_template(&self, tpl: &NoteTemplate) -> Result<bool, Error> {
        self.db.update_template(tpl)
    }

    /// 删除自定义模板;内置模板返回 false(不可删)
    pub fn delete_template(&self, id: &str) -> Result<bool, Error> {
        self.db.delete_template(id)
    }

    /// 渲染模板:替换 {{date}} 为当天日期(zh-CN 格式,如 2026年8月18日)
    pub fn render(&self, content: &str) -> String {
        let today = chrono::Local::now().format("%Y年%m月%d日").to_string();
        content.replace("{{date}}", &today)
    }
}
