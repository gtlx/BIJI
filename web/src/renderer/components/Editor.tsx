import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Note, AppSettings, EditorMode, MarkdownPreviewMode } from '@shared/types';
import './Editor.css';

interface EditorProps {
  note: Note | null;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
  settings: AppSettings | null;
  syncEnabled?: boolean;
}

export function Editor({ note, onSave, onDelete, settings, syncEnabled = false }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('markdown');
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>('live');
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSave = useCallback(async () => {
    if (!note) return;
    
    setIsSaving(true);
    const updatedNote: Note = {
      ...note,
      title,
      content,
      tags,
    };
    await onSave(updatedNote);
    setTimeout(() => setIsSaving(false), 300);
  }, [note, title, content, tags, onSave]);

  useEffect(() => {
    if (!note || !settings?.autoSave) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave();
    }, settings.autoSaveInterval || 30000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, tags, note, settings?.autoSave, settings?.autoSaveInterval, handleSave]);

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
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
      handleSave();
    }
  };

  const renderMarkdownPreview = (text: string) => {
    let html = text
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      .replace(/\n/g, '<br>');
    return html;
  };

  if (!note) {
    return (
      <div className="editor-container">
        <div className="empty-state">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
          </svg>
          <p>选择一篇笔记开始编辑</p>
          <p className="hint">或按 Ctrl+N 新建笔记</p>
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
            onChange={e => setTitle(e.target.value)}
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
              onClick={handleSave}
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
            onChange={e => setContent(e.target.value)}
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
                onChange={e => setContent(e.target.value)}
                placeholder="开始编写笔记... (支持 Markdown)"
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
