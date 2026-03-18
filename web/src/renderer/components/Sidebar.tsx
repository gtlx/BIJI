import React from 'react';
import type { Folder } from '@shared/types';
import './Sidebar.css';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onOpenSettings: () => void;
  onOpenPluginManager: () => void;
}

export function Sidebar({ 
  folders, 
  selectedFolderId, 
  onSelectFolder,
  onOpenSettings,
  onOpenPluginManager 
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">Biji Note</h1>
      </div>
      
      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${selectedFolderId === null ? 'active' : ''}`}
          onClick={() => onSelectFolder(null)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          <span>所有笔记</span>
        </button>

        <div className="nav-section">
          <div className="nav-section-title">文件夹</div>
          {folders.map(folder => (
            <button
              key={folder.id}
              className={`nav-item ${selectedFolderId === folder.id ? 'active' : ''}`}
              onClick={() => onSelectFolder(folder.id)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item" onClick={onOpenPluginManager}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>
          </svg>
          <span>插件管理</span>
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
