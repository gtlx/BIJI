import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, AppSettings, EditorMode, MarkdownPreviewMode, NoteFrontmatter } from '@shared/types';
import './Editor.css';

interface EditorProps {
  note: Note | null;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
  settings: AppSettings | null;
  syncEnabled: boolean;
  onOpenGraph?: () => void;
  onLinkClick?: (noteTitle: string) => void;
  scrollToHeading?: string | null;
  externalEditorMode?: EditorMode;
  externalPreviewMode?: MarkdownPreviewMode;
  onEditorModeChange?: (mode: EditorMode) => void;
  onPreviewModeChange?: (mode: MarkdownPreviewMode) => void;
}

export function Editor({ note, onSave, onDelete, settings, syncEnabled, onOpenGraph, onLinkClick, scrollToHeading, externalEditorMode, externalPreviewMode, onEditorModeChange, onPreviewModeChange }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('markdown');
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>('live');
  const [frontmatter, setFrontmatter] = useState<NoteFrontmatter>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  
  void syncEnabled;

  const parseFrontmatter = useCallback((text: string): { frontmatter: NoteFrontmatter; content: string } => {
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) {
      return { frontmatter: {}, content: text };
    }

    const fmText = fmMatch[1];
    const content = fmMatch[2];
    const fm: NoteFrontmatter = {};

    const lines = fmText.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      if (value === '') {
        fm[key] = '';
      } else if (value === 'true') {
        fm[key] = true;
      } else if (value === 'false') {
        fm[key] = false;
      } else if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
        fm[key] = items.filter(Boolean);
      } else if (typeof value === 'string' && !isNaN(Number(value))) {
        fm[key] = Number(value);
      } else {
        fm[key] = value as string;
      }
    }

    return { frontmatter: fm, content };
  }, []);

  const generateFrontmatter = useCallback((fm: NoteFrontmatter, existingContent: string): string => {
    const fmLines: string[] = ['---'];
    
    if (fm.title) fmLines.push(`title: ${fm.title}`);
    if (fm.aliases && fm.aliases.length > 0) {
      fmLines.push(`aliases:`);
      fm.aliases.forEach(alias => fmLines.push(`  - ${alias}`));
    }
    if (fm.tags && fm.tags.length > 0) {
      fmLines.push(`tags:`);
      fm.tags.forEach(tag => fmLines.push(`  - ${tag}`));
    }
    if (fm.created) fmLines.push(`created: ${fm.created}`);
    if (fm.updated) fmLines.push(`updated: ${fm.updated}`);
    if (fm.completed !== undefined) fmLines.push(`completed: ${fm.completed}`);
    
    for (const [key, value] of Object.entries(fm)) {
      if (!['title', 'aliases', 'tags', 'created', 'updated', 'completed'].includes(key)) {
        if (typeof value === 'string') {
          fmLines.push(`${key}: ${value}`);
        } else if (typeof value === 'boolean') {
          fmLines.push(`${key}: ${value}`);
        } else if (typeof value === 'number') {
          fmLines.push(`${key}: ${value}`);
        }
      }
    }
    
    fmLines.push('---');

    const hasFrontmatter = existingContent.startsWith('---');
    if (hasFrontmatter) {
      const match = existingContent.match(/^---\n[\s\S]*?\n---\n?/);
      if (match) {
        return existingContent.slice(match[0].length);
      }
    }
    
    return fmLines.join('\n') + '\n\n' + existingContent;
  }, []);

  useEffect(() => {
    if (externalEditorMode && externalEditorMode !== editorMode) {
      setEditorMode(externalEditorMode);
    }
  }, [externalEditorMode]);

  useEffect(() => {
    if (externalPreviewMode && externalPreviewMode !== previewMode) {
      setPreviewMode(externalPreviewMode);
    }
  }, [externalPreviewMode]);

  const handleEditorModeChange = (mode: EditorMode) => {
    setEditorMode(mode);
    onEditorModeChange?.(mode);
  };

  const handlePreviewModeChange = (mode: MarkdownPreviewMode) => {
    setPreviewMode(mode);
    onPreviewModeChange?.(mode);
  };

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      const { frontmatter: fm, content: noteContent } = parseFrontmatter(note.content);
      setContent(noteContent);
      setFrontmatter(fm);
      
      const mergedTags = [...new Set([...(fm.tags || []), ...note.tags])];
      setTags(mergedTags);
    } else {
      setTitle('');
      setContent('');
      setFrontmatter({});
      setTags([]);
    }
  }, [note?.id, parseFrontmatter]);

  useEffect(() => {
    if (settings?.editorMode) {
      handleEditorModeChange(settings.editorMode);
    }
    if (settings?.markdownPreviewMode) {
      handlePreviewModeChange(settings.markdownPreviewMode);
    }
  }, [settings?.editorMode, settings?.markdownPreviewMode]);

  useEffect(() => {
    if (scrollToHeading && textareaRef.current) {
      const textarea = textareaRef.current;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(scrollToHeading)) {
          const pos = lines.slice(0, i).join('\n').length;
          textarea.setSelectionRange(pos, pos + scrollToHeading.length);
          textarea.focus();
          textarea.scrollTop = i * 24 - 100;
          break;
        }
      }
    }
  }, [scrollToHeading, content]);

  const handleSave = useCallback(() => {
    if (!note) return;
    
    const updatedFrontmatter: NoteFrontmatter = {
      ...frontmatter,
      title,
      tags,
      updated: new Date().toISOString().split('T')[0],
    };
    
    const contentWithFm = generateFrontmatter(updatedFrontmatter, content);
    
    const updatedNote: Note = {
      id: note.id,
      title,
      content: contentWithFm,
      tags,
      folderId: note.folderId,
      createdAt: note.createdAt,
      updatedAt: Date.now(),
      isEncrypted: note.isEncrypted,
      syncStatus: 'pending',
    };
    onSave(updatedNote);
  }, [note, title, content, tags, frontmatter, onSave, generateFrontmatter]);

  const scheduleAutoSave = useCallback(() => {
    if (!note || !settings?.autoSave) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave();
      setIsSaving(true);
      setTimeout(() => setIsSaving(false), 300);
    }, settings.autoSaveInterval || 3000);
  }, [note, settings?.autoSave, settings?.autoSaveInterval, handleSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    scheduleAutoSave();
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;
    const newContent = e.target.value;
    setContent(newContent);
    
    const extractedTags = extractTags(newContent);
    const mergedTags = [...new Set([...tags, ...extractedTags])];
    if (mergedTags.length !== tags.length) {
      setTags(mergedTags);
    }
    
    scheduleAutoSave();
  };

  const extractTags = (text: string): string[] => {
    const tagRegex = /#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g;
    const matches = text.matchAll(tagRegex);
    const tags = new Set<string>();
    for (const match of matches) {
      tags.add(match[1].toLowerCase());
    }
    return Array.from(tags);
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    const target = e.target as HTMLTextAreaElement;
    setContent(target.value);
    scheduleAutoSave();
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
        scheduleAutoSave();
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
    scheduleAutoSave();
  };

  const handleDelete = () => {
    if (note) {
      onDelete(note.id);
      setShowDeleteConfirm(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      handleSave();
      setIsSaving(true);
      setTimeout(() => setIsSaving(false), 300);
    }
  };

  const handleWikilinkClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wikilink') && onLinkClick) {
      e.preventDefault();
      const noteTitle = target.getAttribute('data-note');
      if (noteTitle) {
        onLinkClick(noteTitle);
      }
    }
    if (target.classList.contains('md-tag')) {
      e.preventDefault();
      const tag = target.getAttribute('data-tag');
      if (tag) {
        handleTagClick(tag);
      }
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

  const handleTagClick = (tag: string) => {
    setTagInput(`#${tag}`);
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
          <input
            type="text"
            className="editor-title"
            value={title}
            onChange={handleTitleChange}
            placeholder="标题"
          />
          <div className="editor-actions">
            {settings && (
              <div className="editor-mode-switch">
                <button
                  className={`mode-btn ${editorMode === 'rich' ? 'active' : ''}`}
                  onClick={() => handleEditorModeChange('rich')}
                  title="富文本模式"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button
                  className={`mode-btn ${editorMode === 'markdown' ? 'active' : ''}`}
                  onClick={() => handleEditorModeChange('markdown')}
                  title="Markdown 模式"
                >
                  M
                </button>
              </div>
            )}
            
            {editorMode === 'markdown' && (
              <div className="preview-mode-switch">
                <button
                  className={`mode-btn ${previewMode === 'live' ? 'active' : ''}`}
                  onClick={() => handlePreviewModeChange('live')}
                  title="实时预览"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                </button>
                <button
                  className={`mode-btn ${previewMode === 'edit' ? 'active' : ''}`}
                  onClick={() => handlePreviewModeChange('edit')}
                  title="笔记模式"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
                  </svg>
                </button>
                <button
                  className={`mode-btn ${previewMode === 'preview' ? 'active' : ''}`}
                  onClick={() => handlePreviewModeChange('preview')}
                  title="预览模式"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/>
                  </svg>
                </button>
              </div>
            )}

            {onOpenGraph && (
              <button
                className="btn-icon tooltip"
                onClick={onOpenGraph}
                title="知识图谱"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
              </button>
            )}

            <button
              className="btn-icon tooltip"
              title="属性"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
              </svg>
            </button>

            {isSaving && <span className="saving-indicator">保存中...</span>}
            <button 
              className="btn-icon tooltip" 
              data-tooltip="删除笔记"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => {
                if (saveTimeoutRef.current) {
                  clearTimeout(saveTimeoutRef.current);
                }
                handleSave();
                setIsSaving(true);
                setTimeout(() => setIsSaving(false), 300);
              }}
            >
              保存
            </button>
          </div>
        </div>

        <div className="editor-tags">
          {tags.map(tag => (
            <span key={tag} className="tag">
              {tag}
              <button className="tag-remove" onClick={() => handleRemoveTag(tag)}>×</button>
            </span>
          ))}
          <input
            type="text"
            className="tag-input"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="添加标签..."
          />
        </div>

        {editorMode === 'rich' ? (
          <textarea
            ref={textareaRef}
            className="editor-content"
            value={content}
            onChange={handleContentChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder="开始编写笔记... (富文本模式)"
            style={{
              fontFamily: settings?.fontFamily || 'inherit',
              fontSize: `${settings?.fontSize || 14}px`,
            }}
          />
        ) : (
          <div className={`markdown-editor markdown-${previewMode}`}>
            {(previewMode === 'live' || previewMode === 'edit') && (
              <textarea
                ref={textareaRef}
                className="editor-content"
                value={content}
                onChange={handleContentChange}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                placeholder="开始编写笔记... (支持 Markdown，使用 [[标题]] 创建链接)"
                style={{
                  fontFamily: settings?.fontFamily || 'inherit',
                  fontSize: `${settings?.fontSize || 14}px`,
                }}
              />
            )}
            {(previewMode === 'live' || previewMode === 'preview') && (
              <div 
                className="markdown-preview"
                dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) }}
                onClick={handleWikilinkClick}
              />
            )}
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">确认删除</h2>
            </div>
            <div className="modal-body">
              <p>确定要删除这篇笔记吗？此操作不可撤销。</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                取消
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
