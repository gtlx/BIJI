import { useState } from 'react';
import type { NoteTemplate } from '../api/backend';
import { StrokeIcon } from '../icons';
import './NewNoteModal.css';

interface NewNoteModalProps {
  templates: NoteTemplate[];
  onSelect: (template: NoteTemplate) => void;
  onClose: () => void;
}

/** [M3.5b 笔记模板] 新建笔记时选模板(空白/日记/会议/读书/自定义) */
export function NewNoteModal({ templates, onSelect, onClose }: NewNoteModalProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customContent, setCustomContent] = useState('');

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
            <button
              key={t.id}
              className="new-note-card"
              onClick={() => onSelect(t)}
            >
              <span className="new-note-card-icon">
                <StrokeIcon name={t.id === 'blank' ? 'notes' : 'template'} size={20} />
              </span>
              <span className="new-note-card-name">{t.name}</span>
              <span className="new-note-card-desc">
                {t.category === 'blank' ? '空白文档' : t.category === 'diary' ? '日期 / 天气 / 今日要点' : t.category === 'meeting' ? '议程 / 讨论 / 待办' : t.category === 'reading' ? '书名 / 笔记 / 摘录' : '自定义模板'}
              </span>
            </button>
          ))}

          <button className="new-note-card custom" onClick={() => setShowCustom(v => !v)}>
            <span className="new-note-card-icon"><StrokeIcon name="plus" size={20} /></span>
            <span className="new-note-card-name">自定义模板</span>
            <span className="new-note-card-desc">创建自己的模板</span>
          </button>
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
