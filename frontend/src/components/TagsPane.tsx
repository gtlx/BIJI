import { useState } from 'react';
import type { Note, TagCount } from '../api/backend';
import { StrokeIcon } from '../icons';
import './TagsPane.css';

/**
 * [Pane 标签面板] 标签主入口面板(侧栏标签树已移除,这里唯一入口)
 *
 * - 展示全部标签及笔记数(可过滤)
 * - 点某标签 → 展开该标签下笔记列表 + 过滤文件列表(与 NoteList 联动)
 * - 展开的笔记可点进打开(onOpenNote)
 * - 再点一次取消展开/取消过滤
 */
interface TagsPaneProps {
  tags: TagCount[];
  notes: Note[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  /** 点击标签下某笔记 → 打开该笔记 */
  onOpenNote?: (id: string, title: string) => void;
}

export function TagsPane({ tags, notes, selectedTag, onSelectTag, onOpenNote }: TagsPaneProps) {
  const [filter, setFilter] = useState('');
  /** 展开的标签(其下笔记列表显示) */
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const kw = filter.trim().toLowerCase();
  const shown = kw
    ? tags.filter(t => t.name.toLowerCase().indexOf(kw) !== -1)
    : tags;

  const countFor = (tag: string) =>
    notes.filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === tag.toLowerCase())).length;

  const toggle = (tag: string) => {
    // 再点已展开标签 = 取消过滤 + 收起
    if (selectedTag === tag) { onSelectTag(null); setExpandedTag(null); return; }
    onSelectTag(tag);
    setExpandedTag(expandedTag === tag ? null : tag);
  };

  return (
    <div className="tags-pane">
      <div className="tags-pane-search">
        <StrokeIcon name="search" size={14} />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="过滤标签..."
          className="tags-pane-input"
        />
        {filter && (
          <button className="tags-pane-clear" onClick={() => setFilter('')} title="清除过滤">
            <StrokeIcon name="close" size={13} />
          </button>
        )}
      </div>

      {selectedTag && (
        <button className="tags-pane-active-tag" onClick={() => { onSelectTag(null); setExpandedTag(null); }} title="取消标签过滤">
          <StrokeIcon name="tag" size={13} />
          <span>{selectedTag}</span>
          <StrokeIcon name="close" size={13} />
        </button>
      )}

      <div className="tags-pane-list">
        {shown.length === 0 && <p className="tags-pane-empty">暂无标签</p>}
        {shown.map(t => {
          const count = t.count ?? countFor(t.name);
          const active = selectedTag === t.name;
          const isOpen = expandedTag === t.name;
          const tagNotes = notes.filter(n => !n.deleted_at && n.tags.some(x => x.toLowerCase() === t.name.toLowerCase()));
          return (
            <div key={t.name} className="tags-pane-group">
              <button
                className={`tags-pane-item ${active ? 'active' : ''}`}
                onClick={() => toggle(t.name)}
                title={`按标签 ${t.name} 过滤`}
              >
                <span className="tags-pane-chevron">
                  <StrokeIcon name={isOpen ? 'chevron_down' : 'chevron_right'} size={12} />
                </span>
                <StrokeIcon name="tag" size={14} />
                <span className="tags-pane-name">{t.name}</span>
                <span className="tags-pane-count">{count}</span>
              </button>
              {isOpen && (
                <div className="tags-pane-notes">
                  {tagNotes.length === 0 ? (
                    <p className="tags-pane-notes-empty">该标签下暂无笔记</p>
                  ) : (
                    tagNotes.map(n => (
                      <button
                        key={n.id}
                        className="tags-pane-note"
                        onClick={() => onOpenNote?.(n.id, n.title)}
                        title={n.title}
                      >
                        <span className="tags-pane-note-title">{n.title || '无标题'}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}