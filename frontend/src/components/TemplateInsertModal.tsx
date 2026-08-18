/**
 * [模板一键插入] 把常用模板内容插入当前笔记正文光标处
 *
 * - 列出全部模板(内置 + 自定义)
 * - 选中 → 在 Editor 光标处插入模板内容,{{date}} 等变量就地替换
 * - 相比「新建」入口,这是对已有笔记「插入片段」
 */
import { useMemo, useState } from 'react';
import type { NoteTemplate } from '../api/backend';
import { StrokeIcon } from '../icons';
import './TemplateInsertModal.css';

interface TemplateInsertModalProps {
  templates: NoteTemplate[];
  onInsert: (template: NoteTemplate) => void;
  onClose: () => void;
}

/** 预览:替换变量并折叠长文本 */
function previewContent(t: NoteTemplate): string {
  const today = new Date().toLocaleDateString('zh-CN');
  const c = (t.content || '').replace(/\{\{date\}\}/g, today);
  return c.trim() || '(空模板)';
}

export function TemplateInsertModal({ templates, onInsert, onClose }: TemplateInsertModalProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  const list = useMemo(() => templates, [templates]);

  return (
    <div className="tpl-overlay" onClick={onClose}>
      <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-header">
          <span className="tpl-title">
            <StrokeIcon name="template" size={18} /> 插入模板到当前笔记
          </span>
          <button className="tpl-close" onClick={onClose}>
            <StrokeIcon name="close" size={18} />
          </button>
        </div>

        <div className="tpl-body">
          <p className="tpl-tip">选择模板,其内容将插入到编辑器中光标所在位置({'{'}{'{'}date{'}'}{'}'} 会自动替换为今天)。</p>
          <div className="tpl-list">
            {list.map(t => (
              <div key={t.id} className={`tpl-item ${previewId === t.id ? 'open' : ''}`}>
                <div className="tpl-item-head">
                  <span className="tpl-item-icon">
                    <StrokeIcon name={t.id === 'blank' ? 'notes' : 'template'} size={17} />
                  </span>
                  <span className="tpl-item-name">{t.name}</span>
                  <span className="tpl-item-cat">
                    {t.category === 'blank' ? '空白' : t.category === 'diary' ? '日记' : t.category === 'meeting' ? '会议' : t.category === 'reading' ? '读书' : '自定义'}
                  </span>
                  <button className="tpl-preview-btn" onClick={() => setPreviewId(previewId === t.id ? null : t.id)} title="预览">
                    <StrokeIcon name="outline" size={15} />
                  </button>
                  <button className="tpl-insert-btn" onClick={() => onInsert(t)}>
                    插入
                  </button>
                </div>
                {previewId === t.id && (
                  <pre className="tpl-preview">{previewContent(t)}</pre>
                )}
              </div>
            ))}
          </div>
          <button className="tpl-done btn btn-secondary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}
