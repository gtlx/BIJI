import React, { useState } from 'react';
import type { AppSettings, Plugin } from '@shared/types';
import './SettingsModal.css';

interface SettingsModalProps {
  settings: AppSettings;
  plugins: Plugin[];
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>) => void;
  onTogglePlugin: (id: string, enabled: boolean) => void;
}

export function SettingsModal({ settings, plugins, onClose, onSave, onTogglePlugin }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'sync' | 'shortcuts' | 'appearance' | 'plugins'>('general');

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handleSelectStoragePath = async () => {
    if (window.electronAPI?.selectPath) {
      const path = await window.electronAPI.selectPath();
      if (path) {
        setLocalSettings({ ...localSettings, storagePath: path });
        await window.electronAPI.setStoragePath(path);
      }
    }
  };

  const handleSelectSyncPath = async () => {
    if (window.electronAPI?.selectPath) {
      const path = await window.electronAPI.selectPath();
      if (path) {
        setLocalSettings({ ...localSettings, syncPath: path });
      }
    }
  };

  const templates = [
    { id: 'blank', name: '空白笔记' },
    { id: 'meeting', name: '会议记录' },
    { id: 'daily', name: '每日日志' },
    { id: 'todo', name: '待办清单' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal settings-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">设置</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="settings-tabs">
          <button className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>通用</button>
          <button className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`} onClick={() => setActiveTab('editor')}>编辑器</button>
          <button className={`tab-btn ${activeTab === 'sync' ? 'active' : ''}`} onClick={() => setActiveTab('sync')}>同步</button>
          <button className={`tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>快捷键</button>
          <button className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>外观</button>
          <button className={`tab-btn ${activeTab === 'plugins' ? 'active' : ''}`} onClick={() => setActiveTab('plugins')}>插件</button>
        </div>

        <div className="modal-body settings-tabs-content">
          {activeTab === 'general' && (
            <>
              <div className="settings-section">
                <h3 className="settings-section-title">存储</h3>
                <div className="settings-item">
                  <label>数据存储路径</label>
                  <div className="path-input">
                    <input type="text" className="input" value={localSettings.storagePath || '默认路径'} readOnly />
                    <button className="btn btn-secondary" onClick={handleSelectStoragePath}>选择</button>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">自动保存</h3>
                <div className="settings-item">
                  <label>
                    <input type="checkbox" checked={localSettings.autoSave} onChange={e => setLocalSettings({ ...localSettings, autoSave: e.target.checked })} />
                    启用自动保存
                  </label>
                </div>
                <div className="settings-item">
                  <label>自动保存间隔 (毫秒)</label>
                  <input type="number" className="input" value={localSettings.autoSaveInterval} onChange={e => setLocalSettings({ ...localSettings, autoSaveInterval: parseInt(e.target.value) })} min={5000} step={5000} disabled={!localSettings.autoSave} />
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">语言</h3>
                <div className="settings-item">
                  <label>界面语言</label>
                  <select className="input" value={localSettings.language} onChange={e => setLocalSettings({ ...localSettings, language: e.target.value })}>
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === 'editor' && (
            <>
              <div className="settings-section">
                <h3 className="settings-section-title">默认编辑器</h3>
                <div className="settings-item">
                  <label>编辑器模式</label>
                  <select className="input" value={localSettings.editorMode} onChange={e => setLocalSettings({ ...localSettings, editorMode: e.target.value as any })}>
                    <option value="markdown">Markdown</option>
                    <option value="rich">富文本</option>
                  </select>
                </div>
                <div className="settings-item">
                  <label>Markdown 预览模式</label>
                  <select className="input" value={localSettings.markdownPreviewMode} onChange={e => setLocalSettings({ ...localSettings, markdownPreviewMode: e.target.value as any })}>
                    <option value="live">实时预览</option>
                    <option value="edit">笔记模式</option>
                    <option value="preview">预览模式</option>
                  </select>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">笔记模板</h3>
                <div className="settings-item">
                  <label>新建笔记模板</label>
                  <select className="input" value={localSettings.template} onChange={e => setLocalSettings({ ...localSettings, template: e.target.value })}>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">字体</h3>
                <div className="settings-item">
                  <label>字体大小</label>
                  <input type="number" className="input" value={localSettings.fontSize} onChange={e => setLocalSettings({ ...localSettings, fontSize: parseInt(e.target.value) })} min={12} max={24} />
                </div>
                <div className="settings-item">
                  <label>字体</label>
                  <input type="text" className="input" value={localSettings.fontFamily} onChange={e => setLocalSettings({ ...localSettings, fontFamily: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {activeTab === 'sync' && (
            <>
              <div className="settings-section">
                <h3 className="settings-section-title">同步设置</h3>
                <div className="settings-item">
                  <label>
                    <input type="checkbox" checked={localSettings.syncEnabled} onChange={e => setLocalSettings({ ...localSettings, syncEnabled: e.target.checked })} />
                    启用云同步
                  </label>
                </div>
                <div className="settings-item">
                  <label>同步服务</label>
                  <select className="input" value={localSettings.syncProvider || ''} onChange={e => setLocalSettings({ ...localSettings, syncProvider: e.target.value as any })} disabled={!localSettings.syncEnabled}>
                    <option value="">选择服务商</option>
                    <option value="local">本地同步文件夹</option>
                    <option value="web">Web 同步</option>
                    <option value="google">Google Drive</option>
                    <option value="onedrive">OneDrive</option>
                  </select>
                </div>
              </div>

              {localSettings.syncProvider === 'local' && (
                <div className="settings-section">
                  <h3 className="settings-section-title">本地同步</h3>
                  <div className="settings-item">
                    <label>同步文件夹路径</label>
                    <div className="path-input">
                      <input type="text" className="input" value={localSettings.syncPath || ''} onChange={e => setLocalSettings({ ...localSettings, syncPath: e.target.value })} placeholder="选择同步文件夹" disabled={!localSettings.syncEnabled} />
                      <button className="btn btn-secondary" onClick={handleSelectSyncPath} disabled={!localSettings.syncEnabled}>选择</button>
                    </div>
                  </div>
                  <div className="settings-item">
                    <label>同步模式</label>
                    <select className="input" value={localSettings.syncMode} onChange={e => setLocalSettings({ ...localSettings, syncMode: e.target.value as any })} disabled={!localSettings.syncEnabled}>
                      <option value="incremental">增量同步（仅上传更改）</option>
                      <option value="bidirectional">双向同步（带删除）</option>
                    </select>
                  </div>
                </div>
              )}

              {localSettings.syncProvider === 'web' && (
                <div className="settings-section">
                  <h3 className="settings-section-title">Web 同步</h3>
                  <div className="settings-item">
                    <label>Web 同步地址</label>
                    <input type="text" className="input" value={localSettings.syncWebUrl || ''} onChange={e => setLocalSettings({ ...localSettings, syncWebUrl: e.target.value })} placeholder="https://your-sync-server.com/api/sync" disabled={!localSettings.syncEnabled} />
                  </div>
                  <div className="settings-item">
                    <label>Web 同步令牌</label>
                    <input type="password" className="input" value={localSettings.syncWebToken || ''} onChange={e => setLocalSettings({ ...localSettings, syncWebToken: e.target.value })} placeholder="访问令牌" disabled={!localSettings.syncEnabled} />
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'shortcuts' && (
            <div className="settings-section">
              <h3 className="settings-section-title">快捷键设置</h3>
              <div className="settings-item">
                <label>新建笔记</label>
                <input type="text" className="input" value={localSettings.shortcuts?.newNote || 'Ctrl+N'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, newNote: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>新建文件夹</label>
                <input type="text" className="input" value={localSettings.shortcuts?.newFolder || 'Ctrl+Shift+N'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, newFolder: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>保存笔记</label>
                <input type="text" className="input" value={localSettings.shortcuts?.save || 'Ctrl+S'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, save: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>搜索</label>
                <input type="text" className="input" value={localSettings.shortcuts?.search || 'Ctrl+F'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, search: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>切换主题</label>
                <input type="text" className="input" value={localSettings.shortcuts?.toggleTheme || 'Ctrl+Alt+T'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, toggleTheme: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>打开设置</label>
                <input type="text" className="input" value={localSettings.shortcuts?.openSettings || 'Ctrl+,'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, openSettings: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>同步</label>
                <input type="text" className="input" value={localSettings.shortcuts?.sync || 'Ctrl+Shift+S'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, sync: e.target.value } })} />
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <>
              <div className="settings-section">
                <h3 className="settings-section-title">主题</h3>
                <div className="settings-item">
                  <label>主题</label>
                  <select className="input" value={localSettings.theme} onChange={e => setLocalSettings({ ...localSettings, theme: e.target.value as any })}>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                    <option value="system">跟随系统</option>
                  </select>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">自定义 CSS</h3>
                <div className="settings-item">
                  <label>自定义样式</label>
                  <textarea className="input textarea" value={localSettings.customCss || ''} onChange={e => setLocalSettings({ ...localSettings, customCss: e.target.value })} placeholder="输入自定义 CSS 样式..." rows={6} />
                </div>
              </div>
            </>
          )}

          {activeTab === 'plugins' && (
            <div className="settings-section">
              <h3 className="settings-section-title">插件管理</h3>
              {plugins.length === 0 ? (
                <p className="empty-text">暂无插件</p>
              ) : (
                plugins.map(plugin => (
                  <div key={plugin.id} className="plugin-toggle-item">
                    <div className="plugin-info">
                      <span className="plugin-name">{plugin.name}</span>
                      <span className="plugin-desc">{plugin.description}</span>
                    </div>
                    <label className="toggle">
                      <input type="checkbox" checked={plugin.enabled} onChange={e => onTogglePlugin(plugin.id, e.target.checked)} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
