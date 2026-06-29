import { useState, useEffect } from 'react';
import { backend } from '../api';
import type { Note, AppSettings, Plugin } from '../api/backend';
import { DEFAULT_TEMPLATES } from '../api/backend';
import './SettingsModal.css';

interface SettingsModalProps {
  settings: AppSettings;
  plugins: Plugin[];
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>) => Promise<void>;
  onTogglePlugin: (id: string, enabled: boolean) => Promise<void>;
}

export function SettingsModal({ settings, plugins, onClose, onSave, onTogglePlugin }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('appearance');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    await onSave(localSettings);
    onClose();
  };

  const tabs = [
    { id: 'appearance', label: '外观' },
    { id: 'editor', label: '编辑器' },
    { id: 'sync', label: '同步' },
    { id: 'plugins', label: '插件' },
    { id: 'about', label: '关于' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">设置</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <div className="settings-tabs">
            {tabs.map(tab => (
              <button key={tab.id} className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
            ))}
          </div>

          <div className="settings-panel">
            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h3>外观</h3>
                <label className="settings-field">
                  <span>主题</span>
                  <select value={localSettings.theme} onChange={e => setLocalSettings({ ...localSettings, theme: e.target.value as any })}>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                    <option value="system">跟随系统</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>字体大小</span>
                  <input type="number" value={localSettings.font_size} onChange={e => setLocalSettings({ ...localSettings, font_size: parseInt(e.target.value) || 14 })} />
                </label>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="settings-section">
                <h3>编辑器</h3>
                <label className="settings-field">
                  <span>自动保存</span>
                  <input type="checkbox" checked={localSettings.auto_save} onChange={e => setLocalSettings({ ...localSettings, auto_save: e.target.checked })} />
                </label>
                <label className="settings-field">
                  <span>默认模板</span>
                  <select value={localSettings.template} onChange={e => setLocalSettings({ ...localSettings, template: e.target.value })}>
                    {DEFAULT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>
            )}

            {activeTab === 'sync' && (
              <div className="settings-section">
                <h3>云同步</h3>
                <label className="settings-field">
                  <span>启用同步</span>
                  <input type="checkbox" checked={localSettings.sync_enabled} onChange={e => setLocalSettings({ ...localSettings, sync_enabled: e.target.checked })} />
                </label>
                <label className="settings-field">
                  <span>WebDAV 地址</span>
                  <input type="text" value={localSettings.sync_web_url} onChange={e => setLocalSettings({ ...localSettings, sync_web_url: e.target.value })} />
                </label>
                <label className="settings-field">
                  <span>用户名</span>
                  <input type="text" value={localSettings.sync_web_username} onChange={e => setLocalSettings({ ...localSettings, sync_web_username: e.target.value })} />
                </label>
                <label className="settings-field">
                  <span>密码</span>
                  <input type="password" value={localSettings.sync_web_password} onChange={e => setLocalSettings({ ...localSettings, sync_web_password: e.target.value })} />
                </label>
              </div>
            )}

            {activeTab === 'plugins' && (
              <div className="settings-section">
                <h3>插件管理</h3>
                {plugins.map(plugin => (
                  <div key={plugin.id} className="plugin-item">
                    <div className="plugin-info">
                      <span className="plugin-name">{plugin.name}</span>
                      <span className="plugin-desc">{plugin.description}</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={plugin.enabled} onChange={e => onTogglePlugin(plugin.id, e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-section">
                <h3>关于 Biji Note</h3>
                <p>版本: 0.1.0</p>
                <p>跨平台笔记编辑器</p>
                <p>Rust + Tauri + React</p>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
