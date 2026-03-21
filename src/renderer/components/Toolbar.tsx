import { useState, useRef } from 'react';
import './Toolbar.css';

export interface ToolbarButton {
  id: string;
  icon: 'graph' | 'git' | 'publish' | 'plugin';
  label: string;
  pluginId?: string;
}

interface ToolbarProps {
  buttons: ToolbarButton[];
  onButtonOrderChange: (buttons: ToolbarButton[]) => void;
  onPluginClick: (pluginId: string) => void;
  onGraphClick: () => void;
  onGitClick: () => void;
  onPublishClick: () => void;
  isGraphActive?: boolean;
  isGitActive?: boolean;
  isPublishActive?: boolean;
}

const ICON_PATHS: Record<string, string> = {
  graph: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  git: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
  publish: 'M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.41 0 8-3.59 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.41 0-8 3.59-8 8H1l4 4 4-4H6z',
  pomodoro: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  plugin: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
};

export function Toolbar({ buttons, onButtonOrderChange, onPluginClick, onGraphClick, onGitClick, onPublishClick, isGraphActive, isGitActive, isPublishActive }: ToolbarProps) {
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
    if (draggedItemRef.current === null || draggedItemRef.current === targetId) return;

    const newButtons = [...buttons];
    const draggedItem = newButtons.find(b => b.id === draggedItemRef.current);
    if (!draggedItem) return;
    
    newButtons.splice(newButtons.findIndex(b => b.id === draggedItemRef.current), 1);
    const insertIdx = newButtons.findIndex(b => b.id === targetId);
    newButtons.splice(insertIdx, 0, draggedItem);
    
    draggedItemRef.current = targetId;
    onButtonOrderChange(newButtons);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    draggedItemRef.current = null;
  };

  const handleButtonClick = (button: ToolbarButton) => {
    if (button.id === 'graph') onGraphClick();
    else if (button.id === 'git') onGitClick();
    else if (button.id === 'publish') onPublishClick();
    else if (button.id === 'plugin' && button.pluginId) onPluginClick(button.pluginId);
  };

  const isButtonActive = (button: ToolbarButton) => {
    if (button.id === 'graph') return isGraphActive;
    if (button.id === 'git') return isGitActive;
    if (button.id === 'publish') return isPublishActive;
    return false;
  };

  return (
    <div className="toolbar">
      <div className="toolbar-header">
        <button
          className="toolbar-edit-btn"
          onClick={() => setEditingButtons(!editingButtons)}
          title={editingButtons ? '完成编辑' : '编辑按钮'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            {editingButtons ? (
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            ) : (
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            )}
          </svg>
        </button>
      </div>
      <div className="toolbar-items">
        {buttons.map((button) => (
          <div
            key={button.id}
            className={`toolbar-btn-wrapper ${isDragging ? 'dragging' : ''}`}
            draggable={editingButtons}
            onDragStart={(e) => handleDragStart(e, button.id)}
            onDragOver={(e) => handleDragOver(e, button.id)}
            onDragEnd={handleDragEnd}
          >
            <button
              className={`toolbar-btn ${isButtonActive(button) ? 'active' : ''}`}
              onClick={() => !editingButtons && handleButtonClick(button)}
              title={button.label}
              style={{ cursor: editingButtons ? 'grab' : 'pointer' }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d={ICON_PATHS[button.icon] || ICON_PATHS.plugin} />
              </svg>
              <span>{button.label}</span>
            </button>
            {editingButtons && (
              <span className="drag-handle">⋮⋮</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
