import { useMemo, useState, useEffect } from 'react';
import type { Note, Folder } from '../api/backend';
import { StrokeIcon } from '../icons';
import './NoteList.css';

interface NoteListProps {
  notes: Note[];
  folders: Folder[];
  selectedNoteId?: string;
  selectedFolderId?: string | null;
  onSelectNote: (note: Note) => void;
  onSelectFolder: (id: string | null) => void;
  onNewNote: () => void;
  /** [M3.5a 标签树] 已选标签:扁平列出该标签下笔记 */
  selectedTag?: string | null;
  /** [M3.5a 标签树] 清除标签过滤(回到文件夹树) */
  onClearTag?: () => void;
}

/** 默认展开深度:根下两层(根=0,一级=1,二级=2),更深默认收起 */
const DEFAULT_EXPAND_DEPTH = 2;
const STORAGE_KEY = 'biji.tree.expanded';

export function NoteList({
  notes, folders, selectedNoteId, selectedFolderId,
  onSelectNote, onSelectFolder, onNewNote, selectedTag = null, onClearTag,
}: NoteListProps) {
  const [filterText, setFilterText] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* 损坏则回退默认 */ }
    return new Set<string>();
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(expanded))); } catch { /* ignore */ }
  }, [expanded]);

  // 初次挂载:按深度种子展开(两层以内)
  useEffect(() => {
    if (expanded.size > 0 || folders.length === 0) return;
    const set = new Set<string>();
    const depth = new Map<string, number>();
    const walk = (parentId: string | null, d: number) => {
      folders.filter(f => f.parent_id === parentId).forEach(f => {
        depth.set(f.id, d);
        if (d < DEFAULT_EXPAND_DEPTH) set.add(f.id);
        walk(f.id, d + 1);
      });
    };
    walk(null, 1);
    if (set.size) setExpanded(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return '昨天';
    if (days < 7) return date.toLocaleDateString('zh-CN', { weekday: 'short' });
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const getPreview = (content: string) => {
    const t = content.replace(/[#*_`~\[\]]/g, '').trim();
    return t.slice(0, 100) || '无内容';
  };

  /** 过滤态:命中的文件夹 id(含祖先链) 与 命中的笔记 id 集合 */
  const filterState = useMemo(() => {
    const kw = filterText.trim();
    if (!kw) return null;
    const lower = kw.toLowerCase();
    const matchedNotes = new Set(
      notes.filter(n => n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)).map(n => n.id)
    );
    const matchedFolders = new Set<string>();
    folders.forEach(f => {
      if (f.name.toLowerCase().includes(lower)) matchedFolders.add(f.id);
    });
    // 命中笔记所在文件夹加入
    notes.forEach(n => {
      if (matchedNotes.has(n.id) && n.folder_id) matchedFolders.add(n.folder_id);
    });
    // 补祖先链
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach(f => {
        if (f.parent_id && matchedFolders.has(f.id) && !matchedFolders.has(f.parent_id)) {
          matchedFolders.add(f.parent_id);
          changed = true;
        }
      });
    }
    // 过滤时自动全展开命中分支,便于查看
    setExpanded(prev => {
      const next = new Set(prev);
      matchedFolders.forEach(id => next.add(id));
      return next;
    });
    return { matchedNotes, matchedFolders };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterText, notes, folders]);

  const toggleFolder = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNote = (note: Note, extraClass = '') => (
    <div
      key={note.id}
      className={`tree-note ${selectedNoteId === note.id ? 'active' : ''} ${extraClass}`}
      onClick={() => onSelectNote(note)}
      title={note.title}
    >
      <div className="tree-note-top">
        <span className="tree-note-title">{note.title || '无标题'}</span>
        <span className="note-item-date">{formatDate(note.updated_at)}</span>
      </div>
      <p className="tree-note-preview">{getPreview(note.content)}</p>
    </div>
  );

  const renderFolder = (folder: Folder, depth: number, filter?: { matchedNotes: Set<string>; matchedFolders: Set<string> }): React.ReactNode => {
    const children = folders.filter(f => f.parent_id === folder.id);
    const folderNotes = notes.filter(n => n.folder_id === folder.id);
    const isOpen = expanded.has(folder.id);
    const hasKids = children.length > 0 || folderNotes.length > 0;
    const isSelected = selectedFolderId === folder.id;
    const active = isSelected;

    // 过滤态:只保留命中的子树与笔迹
    let visibleChildren = children;
    let visibleNotes = folderNotes;
    if (filter) {
      visibleChildren = children.filter(c => filter.matchedFolders.has(c.id) || folderNotes.some(n => n.folder_id === c.id && filter.matchedNotes.has(n.id)));
      visibleNotes = folderNotes.filter(n => filter.matchedNotes.has(n.id));
      if (!filter.matchedFolders.has(folder.id) && visibleNotes.length === 0 && visibleChildren.length === 0) return null;
      // 过滤时强制展开
    }
    const showKids = isOpen || !!filter;

    return (
      <div key={folder.id} className="tree-folder" style={{ '--td': `${depth * 14}px` } as React.CSSProperties}>
        <div
          className={`tree-row folder-row ${active ? 'active' : ''}`}
          onClick={() => { onSelectFolder(folder.id); if (hasKids) toggleFolder(folder.id); }}
          title={folder.name}
        >
          <span className="tree-chevron">
            {hasKids ? (
              <StrokeIcon name={isOpen ? 'chevron_down' : 'chevron_right'} size={14} />
            ) : (
              <span className="tree-chevron-spacer"></span>
            )}
          </span>
          <StrokeIcon name="folder" size={16} />
          <span className="tree-label">{folder.name}</span>
          <span className="tree-count">{folderNotes.length + children.length}</span>
        </div>
        {showKids && (
          <div className="tree-kids">
            {visibleChildren.map(c => renderFolder(c, depth + 1, filter))}
            {visibleNotes.map(n => renderNote(n))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = folders.filter(f => f.parent_id === null);

  return (
    <div className="note-list">
      <div className="note-list-header">
        <button className="btn btn-primary" onClick={onNewNote}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          新建笔记
        </button>
      </div>

      {/* M3:树顶过滤框(按标题过滤文件夹/笔记) */}
      <div className="tree-filter">
        <StrokeIcon name="search" size={14} />
        <input
          type="text"
          className="tree-filter-input"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="过滤文件夹 / 笔记..."
        />
      </div>

      <div className="note-list-content">
        {selectedTag ? (
          /* [M3.5a 标签树] 标签过滤:扁平列出该标签下笔记 */
          <div className="tag-filtered">
            <div className="tag-filter-header">
              <StrokeIcon name="tag" size={14} />
              <span className="tag-filter-label">{selectedTag}</span>
              <span className="tag-filter-count">
                {notes.filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())).length} 篇
              </span>
              <button className="tag-filter-clear" onClick={onClearTag} title="清除标签过滤">
                <StrokeIcon name="close" size={13} />
              </button>
            </div>
            {notes.filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())).length === 0 ? (
              <div className="empty-state"><p>该标签下暂无笔记</p></div>
            ) : (
              <div className="tree tag-list">
                {notes
                  .filter(n => !n.deleted_at && n.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase()))
                  .map(n => renderNote(n))}
              </div>
            )}
          </div>
        ) : notes.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
            </svg>
            <p>暂无笔记</p>
            <button className="btn btn-secondary" onClick={onNewNote}>创建第一篇笔记</button>
          </div>
        ) : (
          <div className="tree">
            {rootFolders.map(f => renderFolder(f, 1, filterState ?? undefined))}
            {(!filterState) && rootFolders.length === 0 ? (
              <div className="tree-kids">{notes.map(n => renderNote(n))}</div>
            ) : filterState ? (
              <div className="tree-kids">
                {notes.filter(n => filterState.matchedNotes.has(n.id) && !n.folder_id).map(n => renderNote(n))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
