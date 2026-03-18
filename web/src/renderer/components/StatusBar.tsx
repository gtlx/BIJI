import React from 'react';
import './StatusBar.css';

interface StatusBarProps {
  storagePath: string;
  syncEnabled: boolean;
  onChangeStoragePath: (path: string) => void;
}

export function StatusBar({ storagePath, syncEnabled, onChangeStoragePath }: StatusBarProps) {
  const handleSelectPath = async () => {
    if (window.electronAPI?.selectPath) {
      const path = await window.electronAPI.selectPath();
      if (path) {
        onChangeStoragePath(path);
      }
    }
  };

  return (
    <div className="status-bar">
      <div className="status-item storage-path" onClick={handleSelectPath} title="点击更改存储路径">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        <span>{storagePath || '默认存储位置'}</span>
      </div>
      
      {syncEnabled && (
        <div className="status-item sync-status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
          </svg>
          <span>同步已启用</span>
        </div>
      )}
    </div>
  );
}
