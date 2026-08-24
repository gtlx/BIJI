import { useState } from 'react';
import { backend } from '../api';
import type { NoteTemplate } from '../api/backend';
import { StrokeIcon } from '../icons';
import './NewNoteModal.css';

interface NewNoteModalProps {
  templates: NoteTemplate[];
  onSelect: (template: NoteTemplate) => void;
  /** [Pane 模板] 删除一个自定义模板后,父级刷新列表 */
  onTemplatesChange?: (templates: NoteTemplate[]) => void;
  onClose: () => void;
}

/** 预览内容(替换 {{date}}/{{title}} 并折叠) */
function previewText(t: NoteTemplate): string {
  const today = new Date().toLocaleDateString('zh-CN');
  const c = (t.content || '').replace(/\{\{date\}\}/g, today).replace(/\{\{title\}\}/g, t.name);
  return c.trim() || '(空模板)';
}

/** 模板类别 → 一句话简介(新建弹窗卡片描述) */
function categoryDesc(t: NoteTemplate): string {
  switch (t.category) {
    case 'blank': return '空白文档';
    case 'diary': return '日期 / 天气 / 今日要点';
    case 'manual': return '概述 / 使用 / 配置';
    case 'knowledge': return '摘要 / 正文 / 双链';
    case 'project': return '目标 / 状态 / 任务';
    case 'meeting': return '议程 / 讨论 / 待办';
    case 'reading': return '书名 / 笔记 / 摘录';
    default: return '自定义模板';
  }
}

/** [M3.5b 笔记模板] 新建笔记时选模板(空白/日记/会议/读书/自定义 + 内容预览 + 自定义 CRUD) */
export function NewNoteModal({ templates, onSelect, onTemplatesChange, onClose }: NewNoteModalProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customContent, setCustomContent] = useState('');

  // 删除自定义模板(内置模板不可删)
  const handleDelete = async (t: NoteTemplate) => {
    if (t.is_builtin) return; // 前端兜底:内置不删
    try {
      await backend.deleteTemplate(t.id);
      onTemplatesChange?.(templates.filter(x => x.id !== t.id));
    } catch { /* 后端不支持则本地移除 */ onTemplatesChange?.(templates.filter(x => x.id !== t.id)); }
  };

  return (
    <div className="new-note-overlay" onClick={onClose}>
      <div className="new-note-modal" onClick={(e) => e.stopPropagation()}>
        <div className="new-note-header">
          <span className="new-note-title">
            <StrokeIcon name="template" size={18} /> 新建笔记 — 选择模板
          </span>
          <button className="new-note-close" onClick={onClose}>
            <StrokeIcon name="close" size={18} />
          </button>
        </div>

        <div className="new-note-grid">
          {templates.map(t => (
            <div key={t.id} className={`new-note-card-wrap ${previewId === t.id ? 'open' : ''}`}>
              <div className="new-note-card">
                <button className="new-note-card-main" onClick={() => onSelect(t)}>
                  <span className="new-note-card-icon">
                    <StrokeIcon name={t.id === 'blank' ? 'notes' : 'template'} size={20} />
                  </span>
                  <span className="new-note-card-name">{t.name}</span>
                  <span className="new-note-card-desc">
                    {categoryDesc(t)}
                  </span>
                </button>
                <button
                  className={`new-note-preview-toggle ${previewId === t.id ? 'active' : ''}`}
                  onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                  title="预览内容"
                >
                  <StrokeIcon name="outline" size={15} />
                </button>
                {!t.is_builtin && (
                  <button className="new-note-delete" onClick={() => handleDelete(t)} title="删除此自定义模板">
                    <StrokeIcon name="trash" size={14} />
                  </button>
                )}
              </div>
              {previewId === t.id && (
                <pre className="new-note-preview">{previewText(t)}</pre>
              )}
            </div>
          ))}

          <div className="new-note-card custom" onClick={() => setShowCustom(v => !v)}>
            <span className="new-note-card-icon"><StrokeIcon name="plus" size={20} /></span>
            <span className="new-note-card-name">自定义模板</span>
            <span className="new-note-card-desc">创建自己的模板</span>
          </div>
        </div>

        {showCustom && (
          <div className="new-note-custom">
            <input
              className="new-note-input"
              placeholder="模板名称(如:周报)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <textarea
              className="new-note-textarea"
              placeholder="模板内容(markdown,可用 {{date}} 表示当天日期)"
              value={customContent}
              onChange={(e) => setCustomContent(e.target.value)}
            />
            <button
              className="new-note-create"
              disabled={!customName.trim()}
              onClick={() => {
                onSelect({ id: '__custom__', name: customName.trim(), category: 'custom', content: customContent, is_builtin: false, created_at: Date.now() });
                setShowCustom(false); setCustomName(''); setCustomContent('');
              }}
            >
              创建并新建
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
