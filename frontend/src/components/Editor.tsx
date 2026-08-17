import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, AppSettings, NoteBlock, Folder, BlockHistoryEntry } from '../api/backend';
import { backend } from '../api';
import { StrokeIcon } from '../icons';
import './Editor.css';

interface EditorProps {
  note: Note | null;
  folders?: Folder[];
  onSelectFolder?: (id: string | null) => void;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
  settings: AppSettings | null;
  syncEnabled: boolean;
  onLinkClick?: (noteTitle: string) => void;
  onTitleChange?: (title: string) => void;
  onToggleOutline?: () => void;
  /** [M3.5a 反向链接] 打开右侧反向链接面板 */
  onOpenBacklinks?: () => void;
  scrollToHeading?: string | null;
  externalEditorMode?: string;
  externalPreviewMode?: string;
  onEditorModeChange?: (mode: string) => void;
  onPreviewModeChange?: (mode: string) => void;
  noteBlocks?: NoteBlock[];
}

interface NoteFrontmatter {
  title?: string;
  aliases?: string[];
  tags?: string[];
  created?: string;
  updated?: string;
  completed?: boolean;
  [key: string]: unknown;
}

/** 演变模式"近期新块"高亮窗口:最近 2 天内创建/更新的块视为新块 */
const RECENT_WINDOW_MS = 2 * 24 * 3600 * 1000;

export function Editor({
  note, folders, onSelectFolder, onSave, onDelete, settings, syncEnabled, onLinkClick,
  onTitleChange, onToggleOutline, onOpenBacklinks, scrollToHeading, externalEditorMode, externalPreviewMode,
  onEditorModeChange, onPreviewModeChange, noteBlocks,
}: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editorMode, setEditorMode] = useState<string>('markdown');
  const [previewMode, setPreviewMode] = useState<string>('live');
  const [frontmatter, setFrontmatter] = useState<NoteFrontmatter>({});
  /** M2 可选开关:每段旁小字块时间戳(localStorage 记忆) */
  const [showBlockTimestamps, setShowBlockTimestamps] = useState<boolean>(() => {
    try { return localStorage.getItem('biji.show_block_timestamps') === '1'; } catch { return false; }
  });
  /** M3 演变模式:开启后块按创建时间重排(展示「先写哪段后写哪段」),退出恢复 sort_order */
  const [timelineMode, setTimelineMode] = useState<boolean>(() => {
    try { return localStorage.getItem('biji.timeline_mode') === '1'; } catch { return false; }
  });
  /** M3 块历史弹层:当前查看历史的块 + 其历史列表 */
  const [historyBlock, setHistoryBlock] = useState<NoteBlock | null>(null);
  const [histories, setHistories] = useState<BlockHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  void syncEnabled;

  const parseFrontmatter = useCallback((text: string): { frontmatter: NoteFrontmatter; content: string } => {
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) return { frontmatter: {}, content: text };
    const fmText = fmMatch[1];
    const restContent = fmMatch[2];
    const fm: NoteFrontmatter = {};
    for (const line of fmText.split('\n')) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let value: unknown = line.slice(idx + 1).trim();
      if (value === 'true') fm[key] = true;
      else if (value === 'false') fm[key] = false;
      else if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
        fm[key] = items.filter(Boolean);
      } else fm[key] = value as string;
    }
    return { frontmatter: fm, content: restContent };
  }, []);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      const { frontmatter: fm, content: noteContent } = parseFrontmatter(note.content);
      setContent(noteContent);
      setFrontmatter(fm);
      setTags([...new Set([...(fm.tags || []), ...note.tags])]);
    } else {
      setTitle(''); setContent(''); setFrontmatter({}); setTags([]);
    }
  }, [note?.id, parseFrontmatter]);

  useEffect(() => {
    if (externalEditorMode && externalEditorMode !== editorMode) setEditorMode(externalEditorMode);
  }, [externalEditorMode]);
  useEffect(() => {
    if (externalPreviewMode && externalPreviewMode !== previewMode) setPreviewMode(externalPreviewMode);
  }, [externalPreviewMode]);

  const handleSave = useCallback(() => {
    if (!note) return;
    const updatedFrontmatter: NoteFrontmatter = {
      ...frontmatter, title, tags,
      updated: new Date().toISOString().split('T')[0],
    };
    let contentWithFm = content;
    if (Object.keys(updatedFrontmatter).length > 0) {
      const fmLines = ['---'];
      for (const [k, v] of Object.entries(updatedFrontmatter)) {
        if (Array.isArray(v)) {
          fmLines.push(`${k}:`);
          v.forEach(item => fmLines.push(`  - ${item}`));
        } else if (typeof v === 'boolean') fmLines.push(`${k}: ${v}`);
        else if (v !== undefined && v !== null) fmLines.push(`${k}: ${v}`);
      }
      fmLines.push('---');
      contentWithFm = fmLines.join('\n') + '\n\n' + content;
    }
    const updatedNote: Note = {
      ...note, title, content: contentWithFm, tags,
      updated_at: Date.now(), sync_status: 'pending',
    };
    onSave(updatedNote);
  }, [note, title, content, tags, frontmatter, onSave]);

  const scheduleAutoSave = useCallback(() => {
    if (!note || !settings?.auto_save) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(handleSave, settings.auto_save_interval || 3000);
  }, [note, settings?.auto_save, settings?.auto_save_interval, handleSave]);

  useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    onTitleChange?.(value);
    scheduleAutoSave();
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;
    const newContent = e.target.value;
    setContent(newContent);
    const extracted = extractTags(newContent);
    const merged = [...new Set([...tags, ...extracted])];
    if (merged.length !== tags.length) setTags(merged);
    scheduleAutoSave();
  };

  const extractTags = (text: string): string[] => {
    const tagRegex = /#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g;
    const tags = new Set<string>();
    let m;
    while ((m = tagRegex.exec(text)) !== null) tags.add(m[1].toLowerCase());
    return Array.from(tags);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) setTags([...tags, newTag]);
      setTagInput('');
      scheduleAutoSave();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
    scheduleAutoSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (historyBlock) { setHistoryBlock(null); setHistories([]); e.preventDefault(); return; }
      if (showDeleteConfirm) { e.preventDefault(); setShowDeleteConfirm(false); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      handleSave();
    }
  };

  const renderMarkdownPreview = (text: string) => {
    let html = text
      .replace(/#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g, '<span class="md-tag" data-tag="$1">#$1</span>')
      .replace(/\[\[([^\]]+)\]\]/g, '<span class="wikilink" data-note="$1">$1</span>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\n/g, '<br>');
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<br><ul>/g, '<ul>');
    html = html.replace(/<\/ul><br>/g, '</ul>');
    return html;
  };

  const handleWikilinkClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wikilink') && onLinkClick) {
      e.preventDefault();
      const noteTitle = target.getAttribute('data-note');
      if (noteTitle) onLinkClick(noteTitle);
    }
  };

  /** M2:块时间戳可选开关(记忆到 localStorage) */
  const toggleBlockTimestamps = () => {
    setShowBlockTimestamps(v => {
      const next = !v;
      try { localStorage.setItem('biji.show_block_timestamps', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  /** M3:演变模式开关(时间线重排,记忆到 localStorage) */
  const toggleTimelineMode = () => {
    setTimelineMode(v => {
      const next = !v;
      try { localStorage.setItem('biji.timeline_mode', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  /** 格式化块时间戳 */
  const fmtTs = (ts: number): string => {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /** M3:点某块时间戳 → 拉取并打开块历史弹层 */
  const openHistory = async (block: NoteBlock) => {
    setHistoryBlock(block);
    setHistoryLoading(true);
    setHistories([]);
    try {
      const list = await backend.getBlockHistory(block.id);
      setHistories(list);
    } catch {
      setHistories([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  /** M3:编辑器顶部面包屑(当前笔记路径,可点击跳层级) */
  const breadcrumb = useCallback(() => {
    if (!note) return [];
    const items: { id: string | null; name: string }[] = [{ id: null, name: '所有笔记' }];
    const path: { id: string; name: string }[] = [];
    let cur = note.folder_id ? folders?.find(f => f.id === note.folder_id) : undefined;
    while (cur) {
      path.unshift({ id: cur.id, name: cur.name });
      cur = cur.parent_id ? folders?.find(f => f.id === cur!.parent_id) : undefined;
    }
    items.push(...path);
    return items;
  }, [note, folders]);

  /** M3:演变模式块列表(按创建时间排序 + 近期新块高亮) */
  const displayBlocks = useCallback((): NoteBlock[] => {
    if (!noteBlocks || noteBlocks.length === 0) return [];
    if (!timelineMode) return noteBlocks;
    return [...noteBlocks].sort((a, b) => a.created_at - b.created_at);
  }, [noteBlocks, timelineMode]);

  const blocksForRender = displayBlocks();
  const useBlockRender = showBlockTimestamps || timelineMode;
  const now = Date.now();

  /** M3:按块渲染(React 元素 → 时间戳可点、演变模式高亮) */
  const renderBlockList = (blocks: NoteBlock[]): React.ReactNode => {
    const seq = timelineMode;
    return blocks.map((b, i) => {
      const recent = b.updated_at >= now - RECENT_WINDOW_MS;
      const tooltip = `创建于 ${new Date(b.created_at).toLocaleString()}\n最后修改于 ${new Date(b.updated_at).toLocaleString()}\n点击查看历史`;
      return (
        <div
          key={b.id}
          className={`block-with-time ${recent ? 'recent' : ''}`}
        >
          <div className="block-body" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(b.content) }} />
          <div className="block-meta">
            {seq && <span className="block-seq">{i + 1}</span>}
            {recent && <span className="block-new-badge">近期</span>}
            <button
              className="block-time clickable"
              title={tooltip}
              onClick={(e) => { e.stopPropagation(); openHistory(b); }}
            >
              {fmtTs(b.updated_at)}
            </button>
          </div>
        </div>
      );
    });
  };

  if (!note) {
    return (
      <div className="editor-container">
        <div className="editor-empty">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
          </svg>
          <p>选择或创建一篇笔记开始编辑</p>
        </div>
      </div>
    );
  }

  const crumbItems = breadcrumb();

  return (
    <div className="editor-container" onKeyDown={handleKeyDown}>
      <div className="editor">
        <div className="editor-header">
          <input type="text" className="editor-title" value={title} onChange={handleTitleChange} placeholder="标题" />
          <div className="editor-actions">
            {onToggleOutline && (
              <button
                className="outline-toggle-btn"
                onClick={onToggleOutline}
                title="大纲"
              >
                <StrokeIcon name="outline" size={18} />
              </button>
            )}
            {onOpenBacklinks && (
              <button
                className="outline-toggle-btn"
                onClick={onOpenBacklinks}
                title="反向链接:谁引用了当前笔记"
              >
                <StrokeIcon name="backlink" size={18} />
              </button>
            )}
            <button
              className={`outline-toggle-btn ${timelineMode ? 'active' : ''}`}
              onClick={toggleTimelineMode}
              title={timelineMode ? '退出演变模式' : '演变模式:按块时间线重排(先写哪段后写哪段)'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13h2v6l4.28 2.54-1 1.72L11 13.6V7z"/>
              </svg>
            </button>
            <button
              className={`outline-toggle-btn block-time-toggle ${showBlockTimestamps ? 'active' : ''}`}
              onClick={toggleBlockTimestamps}
              title={showBlockTimestamps ? '隐藏块时间戳' : '显示块时间戳(每段更新时间)'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm1-13h-2v6l5.25 3.15 1-1.65-4.25-2.5V7z"/>
              </svg>
            </button>
            {editorMode === 'markdown' && (
              <div className="preview-mode-switch">
                <button className={`mode-btn ${previewMode === 'live' ? 'active' : ''}`}
                  onClick={() => { setPreviewMode('live'); onPreviewModeChange?.('live'); }} title="实时预览">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                </button>
                <button className={`mode-btn ${previewMode === 'edit' ? 'active' : ''}`}
                  onClick={() => { setPreviewMode('edit'); onPreviewModeChange?.('edit'); }} title="编辑模式">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                </button>
                <button className={`mode-btn ${previewMode === 'preview' ? 'active' : ''}`}
                  onClick={() => { setPreviewMode('preview'); onPreviewModeChange?.('preview'); }} title="预览模式">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* M3:编辑器顶部面包屑(当前笔记路径,可点击跳层级) */}
        {crumbItems.length > 1 && (
          <div className="editor-breadcrumb">
            {crumbItems.map((item, index) => (
              <span key={item.id ?? 'root'} className="crumb-seg">
                {index > 0 && <span className="crumb-sep">/</span>}
                <button
                  className={`crumb-item ${item.id !== null && item.id === note.folder_id ? 'active' : ''}`}
                  onClick={() => item.id !== null && onSelectFolder?.(item.id)}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="editor-tags">
          {tags.map(tag => (
            <span key={tag} className="tag">{tag}
              <button className="tag-remove" onClick={() => handleRemoveTag(tag)}>×</button>
            </span>
          ))}
          <input type="text" className="tag-input" value={tagInput}
            onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder="添加标签..." />
        </div>

        <div className={`markdown-editor markdown-${previewMode}`}>
          {(previewMode === 'live' || previewMode === 'edit') && (
            <textarea ref={textareaRef} className="editor-content" value={content}
              onChange={handleContentChange} placeholder="开始编写笔记..."
              style={{ fontFamily: settings?.font_family || 'inherit', fontSize: `${settings?.font_size || 14}px` }} />
          )}
          {(previewMode === 'live' || previewMode === 'preview') && (
            <div className="markdown-preview" onClick={handleWikilinkClick}>
              {useBlockRender && blocksForRender.length > 0
                ? <div className="block-previews">{renderBlockList(blocksForRender)}</div>
                : <div dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) }} />}
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">确认删除</h2></div>
            <div className="modal-body"><p>确定要删除这篇笔记吗？</p></div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              <button className="btn btn-danger" onClick={() => { onDelete(note.id); setShowDeleteConfirm(false); }}>删除</button>
            </div>
          </div>
        </div>
      )}

      {/* M3:块历史弹层(时间戳 + 内容快照 + 变更类型) */}
      {historyBlock && (
        <div className="modal-overlay" onClick={() => { setHistoryBlock(null); setHistories([]); }}>
          <div className="modal block-history-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">块历史</h2>
              <button className="modal-close" onClick={() => { setHistoryBlock(null); setHistories([]); }}>×</button>
            </div>
            <div className="modal-body">
              <div className="history-current">
                <span className="history-current-label">当前内容</span>
                <div className="history-snapshot">{historyBlock.content}</div>
              </div>
              <div className="history-hint">创建于 {fmtTs(historyBlock.created_at)} · 最后修改于 {fmtTs(historyBlock.updated_at)}</div>
              <div className="history-list">
                {historyLoading && <div className="search-empty">加载历史中...</div>}
                {!historyLoading && histories.length === 0 && (
                  <div className="search-empty">该块暂无历史变更记录</div>
                )}
                {!historyLoading && histories.map(h => (
                  <div key={h.id} className="history-item">
                    <div className="history-item-head">
                      <span className={`history-type history-type-${h.change_type}`}>
                        {h.change_type === 'create' ? '创建' : h.change_type === 'update' ? '更新' : '删除'}
                      </span>
                      <span className="history-time">{new Date(h.changed_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <div className="history-snapshot">{h.content_snapshot || '(空)'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
