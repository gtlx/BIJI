import { useState } from 'react';
import type { Folder } from '@shared/types';
import './Sidebar.css';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onOpenSettings: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function Sidebar({ 
  folders, 
  selectedFolderId, 
  onSelectFolder,
  onOpenSettings,
  onNewNote,
  onNewFolder
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">Biji Note</h1>
      </div>
      
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
    </aside>
  );
}
