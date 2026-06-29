import type { SyncStatus } from '../api/backend';
import './StatusBar.css';

interface StatusBarProps {
  syncEnabled: boolean;
}

export function StatusBar({ syncEnabled }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-item">就绪</span>
      </div>
      <div className="status-bar-right">
        {syncEnabled && <span className="status-item sync-status">同步已启用</span>}
      </div>
    </div>
  );
}
