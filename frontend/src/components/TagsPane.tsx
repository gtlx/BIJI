import { useState } from 'react';
import type { Note, TagCount } from '../api/backend';
import { StrokeIcon } from '../icons';
import './TagsPane.css';

/**
 * [Pane 标签面板] 独立的「标签」分栏面板
 *
 * - 展示全部标签及笔记数(可过滤)
 * - 点选某标签 → 过滤文件列表(onSelectTag 与侧栏标签联动)
 * - 再点一次取消过滤
 */
interface TagsPaneProps {
  tags: TagCount[];
  notes: Note[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export function TagsPane({ tags, notes, selectedTag, onSelectTag }: TagsPaneProps) {
  const [filter, setFilter] = useState('');

  const kw = filter.trim().toLowerCase();
  const shown = kw
    ? tags.filter(t => t.name.toLowerCase().indexOf(kw) !== -1)
    : tags;

  const countFor = (tag: string) =>
    notes.filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === tag.toLowerCase())).length;

  const toggle = (tag: string) => {
    onSelectTag(selectedTag === tag ? null : tag);
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
        <button className="tags-pane-active-tag" onClick={() => onSelectTag(null)} title="取消标签过滤">
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
          return (
            <button
              key={t.name}
              className={`tags-pane-item ${active ? 'active' : ''}`}
              onClick={() => toggle(t.name)}
              title={`按标签 ${t.name} 过滤`}
            >
              <StrokeIcon name="tag" size={14} />
              <span className="tags-pane-name">{t.name}</span>
              <span className="tags-pane-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
