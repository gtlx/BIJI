import { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, AppSettings, EditorMode, MarkdownPreviewMode } from '@shared/types';
import './Editor.css';

interface EditorProps {
  note: Note | null;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
  settings: AppSettings | null;
  syncEnabled: boolean;
  onOpenGraph?: () => void;
}

export function Editor({ note, onSave, onDelete, settings, syncEnabled, onOpenGraph }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('markdown');
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>('live');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  
  void syncEnabled;

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTags(note.tags);
    } else {
      setTitle('');
      setContent('');
      setTags([]);
    }
  }, [note?.id]);

  useEffect(() => {
    if (settings?.editorMode) {
      setEditorMode(settings.editorMode);
    }
    if (settings?.markdownPreviewMode) {
      setPreviewMode(settings.markdownPreviewMode);
    }
  }, [settings?.editorMode, settings?.markdownPreviewMode]);

  const handleSave = useCallback(() => {
    if (!note) return;
    
    const updatedNote: Note = {
      id: note.id,
      title,
      content,
      tags,
      folderId: note.folderId,
      createdAt: note.createdAt,
      updatedAt: Date.now(),
      isEncrypted: note.isEncrypted,
      syncStatus: 'pending',
    };
    onSave(updatedNote);
  }, [note, title, content, tags, onSave]);

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
    setContent(e.target.value);
    scheduleAutoSave();
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

  const renderMarkdownPreview = (text: string) => {
    let html = text
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
                  onClick={() => setEditorMode('rich')}
                  title="富文本模式"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button
                  className={`mode-btn ${editorMode === 'markdown' ? 'active' : ''}`}
                  onClick={() => setEditorMode('markdown')}
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
                  onClick={() => setPreviewMode('live')}
                  title="实时预览"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                </button>
                <button
                  className={`mode-btn ${previewMode === 'edit' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('edit')}
                  title="笔记模式"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
                  </svg>
                </button>
                <button
                  className={`mode-btn ${previewMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('preview')}
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
