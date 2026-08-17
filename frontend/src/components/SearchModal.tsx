import { useState, useEffect, useRef, useCallback } from 'react';
import type { Note, BlockSearchResult } from '../api/backend';
import { backend } from '../api';
import './SearchModal.css';

interface SearchModalProps {
  notes: Note[];
  /** 检索双模式(M3):title 标题 / content 内容按块命中 */
  mode: 'title' | 'content';
  onModeChange: (mode: 'title' | 'content') => void;
  onClose: () => void;
  onSelectNote: (note: Note) => void;
}

/** 输入防抖毫秒数 */
const DEBOUNCE_MS = 250;

export function SearchModal({ notes, mode, onModeChange, onClose, onSelectNote }: SearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [titleResults, setTitleResults] = useState<Note[]>([]);
  const [blockResults, setBlockResults] = useState<BlockSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRanRef = useRef<{ kw: string; mode: 'title' | 'content' }>({ kw: '', mode: 'title' });

  // 双模式搜索:防抖后按模式调后端(title→笔记 / content→块级命中)
  const runSearch = useCallback(async (kw: string, m: 'title' | 'content') => {
    const query = kw.trim();
    if (!query) { setTitleResults([]); setBlockResults([]); setLoading(false); return; }
    setLoading(true);
    lastRanRef.current = { kw: query, mode: m };
    try {
      if (m === 'title') {
        const res = await backend.searchNotes({ keyword: query, mode: 'title' });
        // 竞态保护:只有仍是这次查询才应用
        if (lastRanRef.current.kw === query && lastRanRef.current.mode === m) setTitleResults(res);
      } else {
        const res = await backend.searchBlocks(query);
        if (lastRanRef.current.kw === query && lastRanRef.current.mode === m) setBlockResults(res);
      }
    } catch { /* 失败静默,保留空态 */ }
    finally {
      if (lastRanRef.current.kw === query && lastRanRef.current.mode === m) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runSearch(keyword, mode); }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [keyword, mode, runSearch]);

  const switchMode = (m: 'title' | 'content') => {
    if (m === mode) return;
    onModeChange(m);
    runSearch(keyword, m);
  };

  /** 内容模式点击命中块 → 跳转到所在笔记(Mock 下定位到笔记即可) */
  const handleBlockClick = (hit: BlockSearchResult) => {
    const note = notes.find(n => n.id === hit.note_id);
    if (note) onSelectNote(note);
  };

  /** 高亮关键词(片段内命中) */
  const highlight = (text: string) => {
    const kw = keyword.trim();
    if (!kw) return text;
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx === -1) return text;
    const slice = text.slice(Math.max(0, idx - 20), idx + kw.length + 40);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const before = esc(slice.slice(0, slice.indexOf(kw)));
    const hit = esc(slice.slice(slice.indexOf(kw), slice.indexOf(kw) + kw.length));
    const after = esc(slice.slice(slice.indexOf(kw) + kw.length));
    return (
      <>
        {idx > 20 && '…'}{before}
        <mark className="hit">{hit}</mark>
        {after}{idx + kw.length < text.length && '…'}
      </>
    );
  };

  const fmtTs = (ts: number): string => {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const noResult = keyword.trim() !== '' && !loading &&
    ((mode === 'title' && titleResults.length === 0) || (mode === 'content' && blockResults.length === 0));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <input type="text" className="search-input" value={keyword}
            onChange={e => setKeyword(e.target.value)} placeholder={mode === 'title' ? '搜索笔记标题...' : '搜索内容(按块命中)...'} autoFocus />
          <div className="search-mode-switch">
            <button className={`mode-btn ${mode === 'title' ? 'active' : ''}`}
              onClick={() => switchMode('title')} title="标题模式:只匹配笔记标题">标题</button>
            <button className={`mode-btn ${mode === 'content' ? 'active' : ''}`}
              onClick={() => switchMode('content')} title="内容模式:按块命中(命中块 + 所在笔记 + 片段)">内容</button>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="search-results">
          {!keyword.trim() && (
            <div className="search-empty">输入关键词开始搜索({mode === 'title' ? '标题模式' : '内容按块模式'})</div>
          )}
          {loading && <div className="search-empty">搜索中...</div>}
          {noResult && <div className="search-empty">未找到匹配{ mode === 'content' ? '的块' : '的笔记' }</div>}

          {/* 标题模式:笔记列表 */}
          {mode === 'title' && !loading && titleResults.map(note => (
            <div key={note.id} className="search-result-item" onClick={() => onSelectNote(note)}>
              <div className="search-result-title">{highlight(note.title) || note.title}</div>
              <div className="search-result-preview">{note.content.slice(0, 80)}</div>
            </div>
          ))}

          {/* 内容模式:块级命中(片段高亮 + 所在笔记名 + 块时间戳) */}
          {mode === 'content' && !loading && blockResults.map(hit => (
            <div key={hit.block_id} className="search-result-item block-hit" onClick={() => handleBlockClick(hit)}>
              <div className="search-result-title">
                <span className="block-hit-note">{hit.note_title}</span>
                <span className="block-hit-time">{fmtTs(hit.updated_at)}</span>
              </div>
              <div className="search-result-preview block-hit-snippet">{highlight(hit.content)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
