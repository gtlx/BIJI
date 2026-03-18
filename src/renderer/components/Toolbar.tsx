import type { Plugin } from '@shared/types';
import './Toolbar.css';

interface ToolbarProps {
  plugins: Plugin[];
  onPluginClick: (pluginId: string) => void;
  onGraphClick: () => void;
  isGraphActive?: boolean;
}

export function Toolbar({ plugins, onPluginClick, onGraphClick, isGraphActive }: ToolbarProps) {
  const enabledPlugins = plugins.filter(p => p.enabled && !p.builtIn);

  return (
    <div className="toolbar">
      <div className="toolbar-items">
        <button
          className={`toolbar-btn ${isGraphActive ? 'active' : ''}`}
          onClick={onGraphClick}
          title="知识图谱"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span>图谱</span>
        </button>

        {enabledPlugins.map(plugin => (
          <button
            key={plugin.id}
            className="toolbar-btn"
            onClick={() => onPluginClick(plugin.id)}
            title={plugin.description}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>
            </svg>
            <span>{plugin.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
