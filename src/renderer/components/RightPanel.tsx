import { useState, useRef } from 'react';
import type { SidebarButton } from './Sidebar';
import './RightPanel.css';

interface RightPanelProps {
  content: string;
  onHeadingClick?: (heading: string, level: number) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  buttons?: SidebarButton[];
  onButtonsChange?: (buttons: SidebarButton[]) => void;
  onButtonClick?: (buttonId: string) => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

const ICON_PATHS: Record<string, string> = {
  outline: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
};

export function RightPanel({ 
  content, 
  onHeadingClick, 
  isCollapsed, 
  onToggle, 
  buttons = [],
  onButtonsChange,
  onButtonClick 
}: RightPanelProps) {
  const headings = useMemo(() => {
    const result: HeadingItem[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        result.push({ id, text, level });
      }
    }
    
    return result;
  }, [content]);

  const [isDragging, setIsDragging] = useState(false);
  const [editingButtons, setEditingButtons] = useState(false);
  const draggedItemRef = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent, buttonId: string) => {
    draggedItemRef.current = buttonId;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedItemRef.current === null || draggedItemRef.current === targetId || !onButtonsChange) return;

    const newButtons = [...buttons];
    const draggedItem = newButtons.find(b => b.id === draggedItemRef.current);
    if (!draggedItem) return;
    
    newButtons.splice(newButtons.findIndex(b => b.id === draggedItemRef.current), 1);
    const insertIdx = newButtons.findIndex(b => b.id === targetId);
    newButtons.splice(insertIdx, 0, draggedItem);
    
    draggedItemRef.current = targetId;
    onButtonsChange(newButtons);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    draggedItemRef.current = null;
  };

  return (
    <aside className={`right-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="right-panel-header">
        <button className="right-panel-toggle" onClick={onToggle} title={isCollapsed ? '展开' : '收起'}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            {isCollapsed ? (
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
            ) : (
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            )}
          </svg>
        </button>
        <h3>大纲</h3>
        <span className="outline-count">{headings.length}</span>
        {onButtonsChange && (
          <button 
            className="right-panel-edit-btn"
            onClick={() => setEditingButtons(!editingButtons)}
            title={editingButtons ? '完成' : '编辑'}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              {editingButtons ? (
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              ) : (
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              )}
            </svg>
          </button>
        )}
      </div>

      {buttons.length > 0 && onButtonsChange && (
        <div className="right-panel-buttons">
          {buttons.map((button) => (
            <div
              key={button.id}
              className={`right-panel-btn-wrapper ${isDragging ? 'dragging' : ''}`}
              draggable={editingButtons}
              onDragStart={(e) => handleDragStart(e, button.id)}
              onDragOver={(e) => handleDragOver(e, button.id)}
              onDragEnd={handleDragEnd}
            >
              <button
                className="right-panel-btn"
                onClick={() => !editingButtons && onButtonClick?.(button.id)}
                title={button.label}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d={ICON_PATHS[button.icon] || ICON_PATHS.outline} />
                </svg>
              </button>
              {editingButtons && (
                <span className="drag-handle">⋮⋮</span>
              )}
            </div>
          ))}
        </div>
      )}
      
      {!isCollapsed && (
        <nav className="right-panel-content">
          {headings.length === 0 ? (
            <div className="outline-empty">
              <p>暂无标题</p>
            </div>
          ) : (
            headings.map((heading, index) => (
              <button
                key={`${heading.id}-${index}`}
                className={`outline-item outline-level-${heading.level}`}
                onClick={() => onHeadingClick?.(heading.text, heading.level)}
              >
                {heading.text}
              </button>
            ))
          )}
        </nav>
      )}
    </aside>
  );
}

import { useMemo } from 'react';
