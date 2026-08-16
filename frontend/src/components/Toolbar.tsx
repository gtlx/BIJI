import type { Plugin } from '../api/backend';
import './Toolbar.css';

export interface ToolbarButton {
  id: string;
  icon: string;
  label: string;
}

interface ToolbarProps {
  buttons: ToolbarButton[];
  onButtonOrderChange: (buttons: ToolbarButton[]) => void;
  onPluginClick: (pluginId: string) => void;
  onBuiltInPluginClick: (pluginId: string) => void;
  onGraphClick: () => void;
  onGitClick: () => void;
  onPublishClick: () => void;
  isGraphActive: boolean;
  isGitActive: boolean;
  isPublishActive: boolean;
  builtInPlugins: Plugin[];
  position: 'left' | 'right';
}

export function Toolbar({
  buttons, onGraphClick, onGitClick, onPublishClick, onPluginClick, onBuiltInPluginClick,
  isGraphActive, isGitActive, isPublishActive,
  builtInPlugins, position
}: ToolbarProps) {
  return (
    <div className={`toolbar toolbar-${position}`}>
      <div className="toolbar-items">
        <button className={`toolbar-btn ${isGraphActive ? 'active' : ''}`} onClick={onGraphClick} title="知识图谱">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span className="toolbar-label">图谱</span>
        </button>

        <button className={`toolbar-btn ${isGitActive ? 'active' : ''}`} onClick={onGitClick} title="Git 版本控制">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span className="toolbar-label">Git</span>
        </button>

        <button className={`toolbar-btn ${isPublishActive ? 'active' : ''}`} onClick={onPublishClick} title="发布">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.41 0 8-3.59 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.41 0-8 3.59-8 8H1l4 4 4-4H6z"/>
          </svg>
          <span className="toolbar-label">发布</span>
        </button>

        <button className="toolbar-btn" onClick={() => onPluginClick('plugins')} title="插件管理">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
          </svg>
          <span className="toolbar-label">插件</span>
        </button>

        {builtInPlugins.filter(p => p.built_in).map(plugin => (
          <button key={plugin.id} className="toolbar-btn" onClick={() => onBuiltInPluginClick(plugin.id)} title={plugin.name}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
            </svg>
            <span className="toolbar-label">{plugin.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
