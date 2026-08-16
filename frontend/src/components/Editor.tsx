import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, AppSettings } from '../api/backend';
import { StrokeIcon } from '../icons';
import './Editor.css';

interface EditorProps {
  note: Note | null;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
  settings: AppSettings | null;
  syncEnabled: boolean;
  onLinkClick?: (noteTitle: string) => void;
  /** 标题输入实时回调:让列表/笔记状态即时同步(新建笔记标题立即生效) */
  onTitleChange?: (title: string) => void;
  /** 打开/关闭右侧大纲栏(桌面编辑器头部按钮) */
  onToggleOutline?: () => void;
  scrollToHeading?: string | null;
  externalEditorMode?: string;
  externalPreviewMode?: string;
  onEditorModeChange?: (mode: string) => void;
  onPreviewModeChange?: (mode: string) => void;
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

export function Editor({
  note, onSave, onDelete, settings, syncEnabled, onLinkClick, onTitleChange, onToggleOutline,
  scrollToHeading, externalEditorMode, externalPreviewMode,
  onEditorModeChange, onPreviewModeChange
}: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editorMode, setEditorMode] = useState<string>('markdown');
  const [previewMode, setPreviewMode] = useState<string>('live');
  const [frontmatter, setFrontmatter] = useState<NoteFrontmatter>({});
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
    // 标题实时同步到上层(列表即时显示,不再等自动保存)
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
    // ESC:关闭删除确认弹窗
    if (e.key === 'Escape' && showDeleteConfirm) {
      e.preventDefault();
      setShowDeleteConfirm(false);
      return;
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
            <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) }} onClick={handleWikilinkClick} />
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
    </div>
  );
}
