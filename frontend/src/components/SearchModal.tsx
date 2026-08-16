import { useState } from 'react';
import type { Note, SearchQuery } from '../api/backend';
import './SearchModal.css';

interface SearchModalProps {
  notes: Note[];
  /** 检索双模式(M2):title 标题 / content 内容按块命中 */
  mode: 'title' | 'content';
  onModeChange: (mode: 'title' | 'content') => void;
  /** 模式切换时触发后端双模式搜索 */
  onSearch: (query: SearchQuery) => void;
  onClose: () => void;
  onSelectNote: (note: Note) => void;
}

export function SearchModal({ notes, mode, onModeChange, onSearch, onClose, onSelectNote }: SearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const results = keyword
    ? notes.filter(n => mode === 'title'
      ? n.title.includes(keyword)
      : n.title.includes(keyword) || n.content.includes(keyword))
    : notes;

  /** 切换模式:更新模式状态并让后端按新模式重搜(块级命中由后端返回) */
  const switchMode = (m: 'title' | 'content') => {
    if (m === mode) return;
    onModeChange(m);
    onSearch({ keyword, mode: m });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <input type="text" className="search-input" value={keyword}
            onChange={e => setKeyword(e.target.value)} placeholder="搜索笔记..." autoFocus />
          <div className="search-mode-switch">
            <button className={`mode-btn ${mode === 'title' ? 'active' : ''}`}
              onClick={() => switchMode('title')} title="标题模式:只匹配笔记标题">标题</button>
            <button className={`mode-btn ${mode === 'content' ? 'active' : ''}`}
              onClick={() => switchMode('content')} title="内容模式:按块命中(命中块 + 所在笔记 + 片段)">内容</button>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="search-results">
          {results.length === 0 && keyword && (
            <div className="search-empty">未找到匹配的笔记</div>
          )}
          {results.map(note => (
            <div key={note.id} className="search-result-item" onClick={() => onSelectNote(note)}>
              <div className="search-result-title">{note.title}</div>
              <div className="search-result-preview">{note.content.slice(0, 100)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
