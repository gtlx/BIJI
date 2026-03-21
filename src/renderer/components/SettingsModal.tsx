import { useState, useEffect } from 'react';
import type { AppSettings, Plugin } from '@shared/types';
import './SettingsModal.css';

interface SettingsModalProps {
  settings: AppSettings;
  plugins: Plugin[];
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>) => void;
  onTogglePlugin: (id: string, enabled: boolean) => void;
}

interface UIPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: 'ui' | 'system';
  entry: string;
  position: string;
}

interface UIPluginConfig {
  enabled: boolean;
  settings?: Record<string, unknown>;
}

export function SettingsModal({ settings, plugins, onClose, onSave, onTogglePlugin }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'shortcuts' | 'appearance' | 'plugins' | 'sync' | 'git' | 'publish'>('general');
  const [uiPlugins, setUiPlugins] = useState<UIPluginManifest[]>([]);
  const [uiPluginConfigs, setUiPluginConfigs] = useState<Record<string, UIPluginConfig>>({});

  const syncPlugin = plugins.find(p => p.id === 'sync-plugin');
  const syncEnabled = syncPlugin?.enabled ?? false;

  useEffect(() => {
    loadUIPlugins();
  }, []);

  async function loadUIPlugins() {
    try {
      const manifests = await window.electronAPI.getUIPlugins();
      setUiPlugins(manifests);
      
      const configs: Record<string, UIPluginConfig> = {};
      for (const plugin of manifests) {
        configs[plugin.id] = await window.electronAPI.getUIPluginConfig(plugin.id);
      }
      setUiPluginConfigs(configs);
    } catch (error) {
      console.error('Failed to load UI plugins:', error);
    }
  }

  async function toggleUIPlugin(pluginId: string, enabled: boolean) {
    const config = uiPluginConfigs[pluginId] || { enabled: false };
    config.enabled = enabled;
    await window.electronAPI.setUIPluginConfig(pluginId, config);
    setUiPluginConfigs(prev => ({ ...prev, [pluginId]: config }));
  }

  async function installUIPlugin() {
    const path = await window.electronAPI.selectPluginPath();
    if (path) {
      const result = await window.electronAPI.installUIPlugin(path);
      if (result) {
        await loadUIPlugins();
      }
    }
  }

  async function uninstallUIPlugin(pluginId: string) {
    if (confirm('确定要卸载这个插件吗？')) {
      await window.electronAPI.uninstallUIPlugin(pluginId);
      await loadUIPlugins();
    }
  }

  const [gitStatus, setGitStatus] = useState<{ files: string[]; clean: boolean }>({ files: [], clean: true });
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  const [publishGenerator, setPublishGenerator] = useState('hugo');
  const [publishSiteName, setPublishSiteName] = useState('我的笔记');
  const [publishOutputPath, setPublishOutputPath] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadGitStatus();
  }, []);

  async function loadGitStatus() {
    try {
      const status = await window.electronAPI.gitStatus();
      setGitStatus(status);
    } catch (error) {
      console.error('Failed to load git status:', error);
    }
  }

  async function handleGitCommit() {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      await window.electronAPI.gitAddAll();
      const result = await window.electronAPI.gitCommit(commitMessage);
      if (result.success) {
        setCommitMessage('');
        await loadGitStatus();
      }
    } catch (error) {
      console.error('Failed to commit:', error);
    }
    setIsCommitting(false);
  }

  async function handleSelectPublishPath() {
    const path = await window.electronAPI.selectPath();
    if (path) {
      setPublishOutputPath(path);
    }
  }

  async function handlePublish() {
    if (!publishOutputPath) {
      setPublishResult({ success: false, message: '请选择输出路径' });
      return;
    }
    setIsPublishing(true);
    setPublishResult(null);
    try {
      const result = await window.electronAPI.publishSite({
        outputPath: publishOutputPath,
        generator: publishGenerator,
        siteName: publishSiteName,
      });
      setPublishResult({
        success: result.success,
        message: result.success ? `发布成功: ${result.outputPath}` : (result.error || '发布失败')
      });
    } catch (error) {
      setPublishResult({ success: false, message: String(error) });
    }
    setIsPublishing(false);
  }

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
          {syncEnabled && <button className={`tab-btn ${activeTab === 'sync' ? 'active' : ''}`} onClick={() => setActiveTab('sync')}>同步</button>}
          <button className={`tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>快捷键</button>
          <button className={`tab-btn ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>外观</button>
          <button className={`tab-btn ${activeTab === 'plugins' ? 'active' : ''}`} onClick={() => setActiveTab('plugins')}>插件</button>
          <button className={`tab-btn ${activeTab === 'git' ? 'active' : ''}`} onClick={() => setActiveTab('git')}>版本控制</button>
          <button className={`tab-btn ${activeTab === 'publish' ? 'active' : ''}`} onClick={() => setActiveTab('publish')}>发布</button>
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

          {activeTab === 'sync' && syncEnabled && (
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
              <div className="settings-item">
                <label>切换侧边栏</label>
                <input type="text" className="input" value={localSettings.shortcuts?.toggleSidebar || 'Ctrl+B'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, toggleSidebar: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>切换图谱</label>
                <input type="text" className="input" value={localSettings.shortcuts?.toggleGraph || 'Ctrl+G'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, toggleGraph: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>切换大纲</label>
                <input type="text" className="input" value={localSettings.shortcuts?.toggleOutline || 'Ctrl+O'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, toggleOutline: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>切换预览模式</label>
                <input type="text" className="input" value={localSettings.shortcuts?.togglePreviewMode || 'Ctrl+P'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, togglePreviewMode: e.target.value } })} />
              </div>
              <div className="settings-item">
                <label>切换编辑模式</label>
                <input type="text" className="input" value={localSettings.shortcuts?.toggleEditorMode || 'Ctrl+E'} onChange={e => setLocalSettings({ ...localSettings, shortcuts: { ...localSettings.shortcuts!, toggleEditorMode: e.target.value } })} />
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
                <h3 className="settings-section-title">缩放</h3>
                <div className="settings-item">
                  <label>界面缩放 (%)</label>
                  <input type="number" className="input" value={localSettings.zoom || 100} onChange={e => setLocalSettings({ ...localSettings, zoom: parseInt(e.target.value) })} min={50} max={200} step={10} />
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
              <h3 className="settings-section-title">UI 插件</h3>
              <p className="settings-desc">UI 插件位于笔记目录的 plugins 文件夹中，支持 Git 版本控制</p>
              
              {uiPlugins.length === 0 ? (
                <p className="empty-text">暂无 UI 插件</p>
              ) : (
                uiPlugins.map(plugin => (
                  <div key={plugin.id} className="plugin-toggle-item">
                    <div className="plugin-info">
                      <span className="plugin-name">
                        {plugin.name}
                        <span className="plugin-version">v{plugin.version}</span>
                      </span>
                      <span className="plugin-desc">{plugin.description}</span>
                    </div>
                    <div className="plugin-actions">
                      <label className="toggle">
                        <input 
                          type="checkbox" 
                          checked={uiPluginConfigs[plugin.id]?.enabled ?? false} 
                          onChange={e => toggleUIPlugin(plugin.id, e.target.checked)} 
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <button 
                        className="btn-icon" 
                        onClick={() => uninstallUIPlugin(plugin.id)}
                        title="卸载插件"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
              
              <button className="btn btn-secondary" onClick={installUIPlugin} style={{ marginTop: '16px' }}>
                安装插件
              </button>

              <h3 className="settings-section-title" style={{ marginTop: '32px' }}>系统插件</h3>
              {plugins.filter(p => p.builtIn).map(plugin => (
                <div key={plugin.id} className="plugin-toggle-item">
                  <div className="plugin-info">
                    <span className="plugin-name">{plugin.name} <span className="built-in-tag">内置</span></span>
                    <span className="plugin-desc">{plugin.description}</span>
                  </div>
                  <div className="plugin-actions">
                    <label className="toggle">
                      <input type="checkbox" checked={plugin.enabled} onChange={e => onTogglePlugin(plugin.id, e.target.checked)} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'git' && (
            <div className="settings-section">
              <h3 className="settings-section-title">版本控制 (Git)</h3>
              {!gitStatus.clean ? (
                <>
                  <div className="settings-item">
                    <label>修改的文件</label>
                    <div className="git-files-list">
                      {gitStatus.files.map((file, i) => (
                        <div key={i} className="git-file-item">{file}</div>
                      ))}
                    </div>
                  </div>
                  <div className="settings-item">
                    <label>提交信息</label>
                    <textarea
                      className="input"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="输入提交信息..."
                      rows={3}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleGitCommit}
                    disabled={isCommitting || !commitMessage.trim()}
                  >
                    {isCommitting ? '提交中...' : '提交更改'}
                  </button>
                </>
              ) : (
                <div className="settings-item">
                  <p>没有待提交的更改</p>
                  <button className="btn btn-secondary" onClick={loadGitStatus}>刷新状态</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'publish' && (
            <div className="settings-section">
              <h3 className="settings-section-title">静态网站发布</h3>
              <div className="settings-item">
                <label>生成器</label>
                <select
                  className="input"
                  value={publishGenerator}
                  onChange={(e) => setPublishGenerator(e.target.value)}
                >
                  <option value="hugo">Hugo</option>
                  <option value="astro">Astro</option>
                  <option value="vitepress">VitePress</option>
                </select>
              </div>
              <div className="settings-item">
                <label>站点名称</label>
                <input
                  type="text"
                  className="input"
                  value={publishSiteName}
                  onChange={(e) => setPublishSiteName(e.target.value)}
                  placeholder="我的笔记"
                />
              </div>
              <div className="settings-item">
                <label>输出路径</label>
                <div className="path-input">
                  <input
                    type="text"
                    className="input"
                    value={publishOutputPath}
                    onChange={(e) => setPublishOutputPath(e.target.value)}
                    placeholder="选择输出目录..."
                    readOnly
                  />
                  <button className="btn btn-secondary" onClick={handleSelectPublishPath}>选择</button>
                </div>
              </div>
              {publishResult && (
                <div className={`publish-result ${publishResult.success ? 'success' : 'error'}`}>
                  {publishResult.message}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handlePublish}
                disabled={isPublishing || !publishOutputPath}
              >
                {isPublishing ? '发布中...' : '发布网站'}
              </button>
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
