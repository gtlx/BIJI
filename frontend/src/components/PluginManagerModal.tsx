import { useState } from 'react';
import { backend } from '../api';
import type { Plugin } from '../api/backend';
import './PluginManagerModal.css';

interface PluginManagerModalProps {
  onClose: () => void;
  onPluginChange: (plugins: Plugin[]) => void;
}

export function PluginManagerModal({ onClose, onPluginChange }: PluginManagerModalProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);

  useState(() => {
    backend.getPlugins().then(p => setPlugins(p));
  });

  const handleToggle = async (id: string, enabled: boolean) => {
    await backend.togglePlugin(id, enabled);
    const updated = plugins.map(p => p.id === id ? { ...p, enabled } : p);
    setPlugins(updated);
    onPluginChange(updated);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal plugin-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">插件管理</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="plugin-list">
          {plugins.map(plugin => (
            <div key={plugin.id} className="plugin-item">
              <div className="plugin-info">
                <span className="plugin-name">{plugin.name}</span>
                <span className="plugin-version">v{plugin.version}</span>
                <p className="plugin-desc">{plugin.description}</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={plugin.enabled} onChange={e => handleToggle(plugin.id, e.target.checked)} />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
