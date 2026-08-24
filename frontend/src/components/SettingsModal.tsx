import { useState, useEffect } from 'react';
import { backend } from '../api';
import type { Note, AppSettings, Plugin, NoteTemplate, Folder } from '../api/backend';
import { DEFAULT_TEMPLATES } from '../api/backend';
import {
  type FolderPresetConfig,
  PRESET_LABELS,
  PRESET_DEFAULT_TEMPLATE_ID,
  PRESET_DEFAULT_NAMING,
  upsertPreset,
  removePreset,
  getPresetForFolder,
} from '../utils/folderPresets';
import './SettingsModal.css';

interface SettingsModalProps {
  settings: AppSettings;
  /** [顶层目录预设] 全部文件夹(含嵌套;只对顶层目录配置用途预设) */
  folders: Folder[];
  /** [顶层目录预设] 顶层目录 → 预设 映射 */
  folderPresets: FolderPresetConfig[];
  /** [顶层目录预设] 变更预设即即时生效(localStorage) */
  onFolderPresetsChange: (p: FolderPresetConfig[]) => void;
  plugins: Plugin[];
  onClose: () => void;
  onSave: (settings: Partial<AppSettings>) => Promise<void>;
  onTogglePlugin: (id: string, enabled: boolean) => Promise<void>;
  /** [M11 收尾] 恢复默认工作区布局(清掉用户/旧版布局记忆) */
  onResetLayout: () => void;
}

/** 顶层目录用途预设可选项(列表顺序即优先级;none = 无预设) */
const PRESET_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: '无预设(新建时选模板)' },
  { value: 'diary', label: '日记(日期命名)' },
  { value: 'manual', label: '手册(结构标题)' },
  { value: 'knowledge', label: '知识库(双链/结构)' },
  { value: 'project', label: '项目(状态模板)' },
  { value: 'custom', label: '自定义' },
];

/** 快捷键条目:key = ShortcutSettings 字段名,label = 中文名 */
const SHORTCUT_FIELDS: { key: keyof AppSettings['shortcuts']; label: string }[] = [
  { key: 'new_note', label: '新建笔记' },
  { key: 'new_folder', label: '新建文件夹' },
  { key: 'save', label: '保存' },
  { key: 'search', label: '搜索' },
  { key: 'toggle_theme', label: '切换主题' },
  { key: 'open_settings', label: '打开设置' },
  { key: 'sync', label: '同步' },
  { key: 'toggle_left_sidebar', label: '左栏' },
  { key: 'toggle_right_sidebar', label: '右栏' },
  { key: 'toggle_graph', label: '图谱' },
  { key: 'toggle_outline', label: '大纲' },
  { key: 'toggle_preview_mode', label: '预览模式' },
  { key: 'toggle_editor_mode', label: '编辑器模式' },
];

export function SettingsModal({ settings, folders, folderPresets, onFolderPresetsChange, plugins, onClose, onSave, onTogglePlugin, onResetLayout }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('appearance');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  // [M11 收尾] 模板管理:加载全量模板(内置 + 自定义,可增删自定义)
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    backend.getTemplates()
      .then(t => { if (t && t.length) setTemplates(t); })
      .catch(() => setTemplates(DEFAULT_TEMPLATES as NoteTemplate[]));
  }, []);

  /** 保存后关闭;localSettings 含 shortcuts/番茄钟等新字段,整体落库 */
  const handleSave = async () => {
    await onSave(localSettings);
    onClose();
  };

  /** 新增自定义模板:先落库再刷新列表 */
  const handleAddTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) return;
    try {
      const created = await backend.createTemplate(name, newTemplateContent);
      setTemplates(prev => [...prev, created]);
      setNewTemplateName('');
      setNewTemplateContent('');
    } catch { /* 后端不支持则静默 */ }
  };

  /** 删除自定义模板(内置模板不可删) */
  const handleDeleteTemplate = async (id: string) => {
    try {
      await backend.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { /* 后端不支持则静默 */ }
  };

  /** 更新某个快捷键(仅本地,点保存后整体提交) */
  const updateShortcut = (key: keyof AppSettings['shortcuts'], value: string) => {
    setLocalSettings(prev => ({ ...prev, shortcuts: { ...prev.shortcuts, [key]: value } }));
  };

  /** [顶层目录预设] 顶层目录(parent_id 为 null)列表 */
  const topFolders = folders.filter(f => f.parent_id == null);

  /** [顶层目录预设] 切换某顶层目录的预设类型(套用该类型默认模板/命名;none 清除绑定) */
  const handlePresetTypeChange = (folderId: string, type: string) => {
    if (type === 'none') { onFolderPresetsChange(removePreset(folderPresets, folderId)); return; }
    onFolderPresetsChange(upsertPreset(folderPresets, {
      folderId,
      type: type as FolderPresetConfig['type'],
      templateId: PRESET_DEFAULT_TEMPLATE_ID[type as FolderPresetConfig['type']] || '',
      namingPattern: PRESET_DEFAULT_NAMING[type as FolderPresetConfig['type']] || '{{title}}',
    }));
  };

  /** [顶层目录预设] 绑定模板(id 变更;自定义或覆盖类型默认) */
  const handlePresetTemplateChange = (folderId: string, templateId: string) => {
    const cfg = getPresetForFolder(folderPresets, folderId);
    if (!cfg) return;
    onFolderPresetsChange(upsertPreset(folderPresets, { ...cfg, templateId }));
  };

  /** [顶层目录预设] 命名规则({{date}} / {{title}} 变量) */
  const handlePresetNamingChange = (folderId: string, namingPattern: string) => {
    const cfg = getPresetForFolder(folderPresets, folderId);
    if (!cfg) return;
    onFolderPresetsChange(upsertPreset(folderPresets, { ...cfg, namingPattern }));
  };

  const tabs = [
    { id: 'appearance', label: '外观' },
    { id: 'editor', label: '编辑器' },
    { id: 'pomodoro', label: '番茄钟' },
    { id: 'workspace', label: '工作区' },
    { id: 'shortcuts', label: '快捷键' },
    { id: 'templates', label: '模板' },
    { id: 'presets', label: '目录预设' },
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
                    <option value="dark">深色(teal)</option>
                    <option value="system">跟随系统</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>字体大小</span>
                  <input type="number" value={localSettings.font_size} onChange={e => setLocalSettings({ ...localSettings, font_size: parseInt(e.target.value) || 14 })} />
                </label>
                <label className="settings-field">
                  <span>字体</span>
                  <select value={localSettings.font_family} onChange={e => setLocalSettings({ ...localSettings, font_family: e.target.value })}>
                    <option value="sans-serif">系统默认</option>
                    <option value="'Noto Serif SC', 'Songti SC', serif">衬线(宋体)</option>
                    <option value="'JetBrains Mono', monospace">等宽(Mono)</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>工具栏位置</span>
                  <select value={localSettings.toolbar_position} onChange={e => setLocalSettings({ ...localSettings, toolbar_position: e.target.value as any })}>
                    <option value="left">左侧</option>
                    <option value="right">右侧</option>
                  </select>
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

            {activeTab === 'pomodoro' && (
              <div className="settings-section">
                <h3>番茄钟</h3>
                <label className="settings-field">
                  <span>专注时长(分钟)</span>
                  <input type="number" min={1} max={90}
                    value={localSettings.pomodoro_focus_minutes ?? 25}
                    onChange={e => setLocalSettings({ ...localSettings, pomodoro_focus_minutes: parseInt(e.target.value) || 25 })} />
                </label>
                <label className="settings-field">
                  <span>休息时长(分钟)</span>
                  <input type="number" min={1} max={30}
                    value={localSettings.pomodoro_break_minutes ?? 5}
                    onChange={e => setLocalSettings({ ...localSettings, pomodoro_break_minutes: parseInt(e.target.value) || 5 })} />
                </label>
                <label className="settings-field">
                  <span>时段结束提醒</span>
                  <input type="checkbox" checked={localSettings.pomodoro_reminder !== false}
                    onChange={e => setLocalSettings({ ...localSettings, pomodoro_reminder: e.target.checked })} />
                </label>
              </div>
            )}

            {activeTab === 'workspace' && (
              <div className="settings-section">
                <h3>默认工作区 / 布局</h3>
                <p className="settings-hint">恢复默认布局:清掉本地记忆的右 dock 布局,回到「左文件 | 主编辑器 | 右 dock 独立分块」。番茄钟等被隐藏的面板可由「添加面板」重新打开。</p>
                <button className="btn btn-secondary" onClick={onResetLayout}>恢复默认布局</button>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="settings-section">
                <h3>快捷键</h3>
                <p className="settings-hint">在这里自定义命令面板快捷键(如 Ctrl/Cmd+K 搜索、Ctrl/Cmd+P 命令面板)。填写组合键文本,保存后生效。</p>
                {SHORTCUT_FIELDS.map(({ key, label }) => (
                  <label key={key} className="settings-field">
                    <span>{label}</span>
                    <input type="text" value={localSettings.shortcuts[key]}
                      onChange={e => updateShortcut(key, e.target.value)} />
                  </label>
                ))}
              </div>
            )}

            {activeTab === 'templates' && (
              <div className="settings-section">
                <h3>模板管理</h3>
                <p className="settings-hint">内置模板不可删除;自定义模板可增/删,新建笔记时可选择。</p>
                {templates.map(t => (
                  <div key={t.id} className="template-row">
                    <div className="template-info">
                      <span className="template-name">{t.name}</span>
                      <span className={`template-badge ${t.is_builtin ? 'builtin' : 'custom'}`}>
                        {t.is_builtin ? '内置' : '自定义'}
                      </span>
                    </div>
                    {!t.is_builtin && (
                      <button className="template-del" title="删除该模板"
                        onClick={() => handleDeleteTemplate(t.id)}>删除</button>
                    )}
                  </div>
                ))}
                <div className="template-add">
                  <input type="text" placeholder="模板名称"
                    value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} />
                  <textarea placeholder="模板内容 {{date}} 会被替换为当天日期"
                    value={newTemplateContent} onChange={e => setNewTemplateContent(e.target.value)} />
                  <button className="btn btn-secondary" onClick={handleAddTemplate}>新增自定义模板</button>
                </div>
              </div>
            )}

            {activeTab === 'presets' && (
              <div className="settings-section">
                <h3>顶层目录用途预设</h3>
                <p className="settings-hint">单笔记库内靠顶层文件夹分类用途。为某个顶层目录绑定预设后,在其下新建笔记会自动套用对应模板与命名规则(知识仍互通,不做多 vault)。仅顶层目录(不带父级)可配置;子文件夹自动继承所属顶层目录的预设。更改即时生效(存于本地)。</p>
                {topFolders.length === 0 && (
                  <p className="settings-hint">暂无顶层目录,请先在左侧创建文件夹。</p>
                )}
                {topFolders.map(folder => {
                  const cfg = getPresetForFolder(folderPresets, folder.id);
                  const type = cfg?.type ?? 'none';
                  return (
                    <div key={folder.id} className="preset-row">
                      <div className="preset-folder">
                        <span className={`preset-folder-dot${folder.color ? '' : ''}`} style={folder.color ? { background: folder.color } : undefined} />
                        <span className="preset-folder-name">{folder.name || '未命名文件夹'}</span>
                        {cfg && cfg.type !== 'none' && (
                          <span className={`preset-badge badge-${cfg.type}`}>{PRESET_LABELS[cfg.type]}</span>
                        )}
                      </div>
                      <label className="preset-field">
                        <span>预设</span>
                        <select value={type} onChange={e => handlePresetTypeChange(folder.id, e.target.value)}>
                          {PRESET_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </label>
                      {cfg && cfg.type !== 'none' && (
                        <>
                          <label className="preset-field">
                            <span>模板</span>
                            <select value={cfg.templateId} onChange={e => handlePresetTemplateChange(folder.id, e.target.value)}>
                              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_builtin ? '(内置)' : '(自定义)'}</option>)}
                            </select>
                          </label>
                          <label className="preset-field">
                            <span>命名</span>
                            <input type="text" value={cfg.namingPattern} placeholder="{{date}} 或 {{title}}"
                              onChange={e => handlePresetNamingChange(folder.id, e.target.value)} />
                          </label>
                        </>
                      )}
                    </div>
                  );
                })}
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