import React, { useState, useEffect } from 'react';
import type { Plugin } from '@shared/types';
import './PluginManagerModal.css';

interface PluginManagerModalProps {
  onClose: () => void;
}

export function PluginManagerModal({ onClose }: PluginManagerModalProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      const data = await window.electronAPI.getPlugins();
      setPlugins(data);
    } catch (error) {
      console.error('Failed to load plugins:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.togglePlugin(id, enabled);
    setPlugins(plugins.map(p => 
      p.id === id ? { ...p, enabled } : p
    ));
  };

  const handleUninstall = async (id: string) => {
    if (confirm('确定要卸载这个插件吗？')) {
      await window.electronAPI.uninstallPlugin(id);
      setPlugins(plugins.filter(p => p.id !== id));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal plugin-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">插件管理</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {isLoading ? (
            <div className="loading">加载中...</div>
          ) : plugins.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>
              </svg>
              <p>暂无已安装的插件</p>
              <p className="hint">从插件市场安装新插件</p>
            </div>
          ) : (
            <div className="plugin-list">
              {plugins.map(plugin => (
                <div key={plugin.id} className="plugin-item">
                  <div className="plugin-info">
                    <h3 className="plugin-name">{plugin.name}</h3>
                    <p className="plugin-description">{plugin.description}</p>
                    <div className="plugin-meta">
                      <span>v{plugin.version}</span>
                      <span>by {plugin.author}</span>
                    </div>
                  </div>
                  <div className="plugin-actions">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        onChange={e => handleToggle(plugin.id, e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <button 
                      className="btn-icon"
                      onClick={() => handleUninstall(plugin.id)}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
