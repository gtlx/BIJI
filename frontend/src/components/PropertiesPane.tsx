/**
 * [M10③ 右 dock 模块独立] 属性面板 —— 真实 frontmatter 属性编辑
 *
 * 独立面板,只编辑当前笔记的 frontmatter 元数据(标题 / 状态 / 标签),
 * 不再与其他模块共享 tab,也替代原有「笔记属性」占位符 + toast。
 * 读写都走 utils/frontmatter.ts 的最小 YAML 实现,与看板状态解析语义一致。
 */
import { useEffect, useState } from 'react';
import type { Note } from '../api/backend';
import { parseFrontmatter, writeFrontmatter } from '../utils/frontmatter';
import './right-panes.css';

interface PropertiesPaneProps {
  /** 当前选中的笔记;为空则显示空态提示 */
  note: Note | null;
  /** 保存更新后的笔记(由 App 持久化并刷新块序列) */
  onSave: (note: Note) => void | Promise<void>;
}

/** 看板/属性共用的状态取值(与 getNoteKanbanStatus 默认值保持一致) */
const STATUS_OPTIONS = ['待办', '进行中', '已完成'];

/** tags 数组 → 逗号分隔的输入框文本 */
const flattenTags = (tags?: string[]) => (tags && tags.length ? tags.join(', ') : '');

/** 输入框文本(中英文逗号分隔)→ 去空 tag 数组 */
const splitTags = (text: string) =>
  text.split(/[,，]/).map(t => t.trim()).filter(Boolean);

export function PropertiesPane({ note, onSave }: PropertiesPaneProps) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  // note 切换时重置表单(用 note id 触控,避免不必要的重渲染)
  useEffect(() => {
    if (!note) { setTitle(''); setStatus(''); setTags(''); return; }
    const { frontmatter } = parseFrontmatter(note.content);
    const fmTags = (frontmatter.tags ?? note.frontmatter?.tags ?? []) as string[];
    setTitle((frontmatter.title as string) ?? note.title ?? '');
    setStatus((frontmatter.status as string) ?? note.frontmatter?.status ?? '');
    setTags(flattenTags(fmTags));
    setSaving(false);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 空态提示(所选笔记为空)
  if (!note) {
    return (
      <div className="properties-panel">
        <p className="outline-empty">未选择笔记</p>
      </div>
    );
  }

  /** 提交:把表单字段写回 content 的 frontmatter 并交给 App 保存 */
  const handleSave = async () => {
    const tagArr = splitTags(tags);
    const patch: Record<string, string | string[] | boolean | undefined> = {
      title: title.trim() || undefined,
      status: status.trim() || undefined,
      tags: tagArr.length ? tagArr : undefined,
    };
    const content = writeFrontmatter(note.content, patch);
    const updated: Note = {
      ...note,
      title: title.trim() || note.title,
      content,
      tags: tagArr,
      frontmatter: {
        ...(note.frontmatter || {}),
        title: title.trim() || undefined,
        status: status.trim() || undefined,
        tags: tagArr.length ? tagArr : undefined,
      },
    };
    setSaving(true);
    try {
      await onSave(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="properties-panel">
      <div className="prop-field">
        <label className="prop-label">标题</label>
        <input
          className="prop-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="笔记标题"
        />
      </div>

      <div className="prop-field">
        <label className="prop-label">状态</label>
        <select className="prop-input prop-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">（无）</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="prop-field">
        <label className="prop-label">标签（逗号分隔）</label>
        <input
          className="prop-input"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="如: 工作, 灵感"
        />
      </div>

      <button className="prop-save" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '保存属性'}
      </button>
    </div>
  );
}