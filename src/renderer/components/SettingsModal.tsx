import React, { useState } from 'react';
import type { AppSettings } from '@shared/types';
import './SettingsModal.css';

interface SettingsModalProps {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>) => void;
}

export function SettingsModal({ settings, onClose, onSave }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings });

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">设置</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3 className="settings-section-title">外观</h3>
            
            <div className="settings-item">
              <label>主题</label>
              <select
                className="input"
                value={localSettings.theme}
                onChange={e => setLocalSettings({ ...localSettings, theme: e.target.value as any })}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="system">跟随系统</option>
              </select>
            </div>

            <div className="settings-item">
              <label>字体大小</label>
              <input
                type="number"
                className="input"
                value={localSettings.fontSize}
                onChange={e => setLocalSettings({ ...localSettings, fontSize: parseInt(e.target.value) })}
                min={12}
                max={24}
              />
            </div>

            <div className="settings-item">
              <label>字体</label>
              <input
                type="text"
                className="input"
                value={localSettings.fontFamily}
                onChange={e => setLocalSettings({ ...localSettings, fontFamily: e.target.value })}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">同步</h3>
            
            <div className="settings-item">
              <label>
                <input
                  type="checkbox"
                  checked={localSettings.syncEnabled}
                  onChange={e => setLocalSettings({ ...localSettings, syncEnabled: e.target.checked })}
                />
                启用云同步
              </label>
            </div>

            <div className="settings-item">
              <label>同步服务</label>
              <select
                className="input"
                value={localSettings.syncProvider || ''}
                onChange={e => setLocalSettings({ ...localSettings, syncProvider: e.target.value as any })}
                disabled={!localSettings.syncEnabled}
              >
                <option value="">选择服务商</option>
                <option value="google">Google Drive</option>
                <option value="onedrive">OneDrive</option>
                <option value="local">本地同步文件夹</option>
              </select>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">安全</h3>
            
            <div className="settings-item">
              <label>
                <input
                  type="checkbox"
                  checked={localSettings.encryptionEnabled}
                  onChange={e => setLocalSettings({ ...localSettings, encryptionEnabled: e.target.checked })}
                />
                启用数据加密
              </label>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">自动保存</h3>
            
            <div className="settings-item">
              <label>
                <input
                  type="checkbox"
                  checked={localSettings.autoSave}
                  onChange={e => setLocalSettings({ ...localSettings, autoSave: e.target.checked })}
                />
                启用自动保存
              </label>
            </div>

            <div className="settings-item">
              <label>自动保存间隔 (毫秒)</label>
              <input
                type="number"
                className="input"
                value={localSettings.autoSaveInterval}
                onChange={e => setLocalSettings({ ...localSettings, autoSaveInterval: parseInt(e.target.value) })}
                min={5000}
                step={5000}
                disabled={!localSettings.autoSave}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section-title">语言</h3>
            
            <div className="settings-item">
              <label>界面语言</label>
              <select
                className="input"
                value={localSettings.language}
                onChange={e => setLocalSettings({ ...localSettings, language: e.target.value })}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </div>
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
