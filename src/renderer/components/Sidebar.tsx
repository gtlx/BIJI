import { useState, useRef } from 'react';
import type { Folder } from '@shared/types';
import './Sidebar.css';

export interface SidebarButton {
  id: string;
  icon: 'search' | 'files' | 'tags' | 'backlinks' | 'outline' | 'graph' | 'calendar' | 'git' | 'publish';
  label: string;
  visible: boolean;
}

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onOpenSettings: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  buttons: SidebarButton[];
  onButtonsChange: (buttons: SidebarButton[]) => void;
  onToggleButton: (id: string) => void;
  onMoveToRight?: (button: SidebarButton) => void;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

const ICON_PATHS: Record<string, string> = {
  search: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  files: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  tags: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z',
  backlinks: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  outline: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  graph: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  calendar: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z',
  git: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
  publish: 'M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.41 0 8-3.59 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.41 0-8 3.59-8 8H1l4 4 4-4H6z',
};

export function Sidebar({ 
  folders, 
  selectedFolderId, 
  onSelectFolder,
  onOpenSettings,
  onNewNote,
  onNewFolder,
  buttons,
  onButtonsChange,
  onToggleButton,
  onMoveToRight
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingButtons, setEditingButtons] = useState(false);
  const draggedItemRef = useRef<number | null>(null);

  const buildBreadcrumb = (folderId: string | null): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [{ id: null, name: '所有笔记' }];
    
    if (folderId) {
      const path: BreadcrumbItem[] = [];
      let current = folders.find(f => f.id === folderId);
      while (current) {
        path.unshift({ id: current.id, name: current.name });
        current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
      }
      items.push(...path);
    }
    
    return items;
  };

  const breadcrumb = buildBreadcrumb(selectedFolderId);
  const subFolders = folders.filter(f => f.parentId === selectedFolderId);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleDragStart = (index: number) => {
    draggedItemRef.current = index;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemRef.current === null || draggedItemRef.current === index) return;

    const newButtons = [...buttons];
    const draggedItem = newButtons[draggedItemRef.current];
    newButtons.splice(draggedItemRef.current, 1);
    newButtons.splice(index, 0, draggedItem);
    draggedItemRef.current = index;
    onButtonsChange(newButtons);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    draggedItemRef.current = null;
  };

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h1 className="app-title">Biji Note</h1>}
        <button 
          className="sidebar-collapse-btn" 
          onClick={toggleCollapse}
          title={collapsed ? '展开' : '折叠'}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            {collapsed ? (
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            ) : (
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
            )}
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="sidebar-buttons">
            {buttons.filter(b => b.visible).map((button, index) => (
              <div
                key={button.id}
                className={`sidebar-btn-wrapper ${isDragging ? 'dragging' : ''}`}
                draggable={editingButtons}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                <button
                  className="sidebar-btn"
                  onClick={() => !editingButtons && onToggleButton(button.id)}
                  title={button.label}
                  style={{ cursor: editingButtons ? 'grab' : 'pointer' }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d={ICON_PATHS[button.icon] || ICON_PATHS.files} />
                  </svg>
                  <span className="sidebar-btn-label">{button.label}</span>
                </button>
                {editingButtons && (
                  <span className="drag-handle">⋮⋮</span>
                )}
              </div>
            ))}
            <button
              className="sidebar-btn add-btn"
              onClick={() => setEditingButtons(!editingButtons)}
              title={editingButtons ? '完成编辑' : '编辑按钮'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                {editingButtons ? (
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                ) : (
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                )}
              </svg>
            </button>
          </div>

          {editingButtons && (
            <div className="button-editor">
              <div className="button-editor-header">可用的按钮</div>
              {buttons.map(button => (
                <label key={button.id} className="button-editor-item">
                  <input
                    type="checkbox"
                    checked={button.visible}
                    onChange={() => onToggleButton(button.id)}
                  />
                  <span>{button.label}</span>
                  <button
                    className="move-right-btn"
                    onClick={() => onMoveToRight?.(button)}
                    title="移动到右侧"
                  >
                    →
                  </button>
                </label>
              ))}
            </div>
          )}
          
          <nav className="sidebar-nav">
            {breadcrumb.length > 1 && (
              <div className="breadcrumb">
                {breadcrumb.map((item, index) => (
                  <span key={item.id ?? 'root'}>
                    {index > 0 && <span className="breadcrumb-sep">/</span>}
                    <button
                      className={`breadcrumb-item ${item.id === selectedFolderId ? 'active' : ''}`}
                      onClick={() => onSelectFolder(item.id)}
                    >
                      {item.name}
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="nav-section">
              <div className="nav-section-header">
                <span className="nav-section-title">
                  {selectedFolderId ? '子文件夹' : '文件夹'}
                </span>
                <button className="nav-action-btn" onClick={onNewFolder} title="新建文件夹">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </button>
              </div>
              
              {subFolders.length > 0 ? (
                subFolders.map(folder => (
                  <button
                    key={folder.id}
                    className="nav-item"
                    onClick={() => onSelectFolder(folder.id)}
                    onDoubleClick={() => toggleFolder(folder.id)}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                    </svg>
                    <span>{folder.name}</span>
                    {expandedFolders.has(folder.id) && (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="folder-arrow">
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                      </svg>
                    )}
                  </button>
                ))
              ) : (
                <p className="empty-text">暂无文件夹</p>
              )}
            </div>
          </nav>

          <div className="sidebar-footer">
            <button className="btn btn-primary sidebar-new-btn" onClick={onNewNote}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              新建笔记
            </button>
            <button className="nav-item" onClick={onOpenSettings}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
              <span>设置</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

export { ICON_PATHS };
