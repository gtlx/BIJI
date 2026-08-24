import { useState, useEffect, useMemo, useRef } from 'react';
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
import { setFrontendPluginEnabled } from '../plugins/registry';
import type { UnifiedPlugin } from '../utils/unifiedPlugins';
import { buildUnifiedPluginList } from '../utils/unifiedPlugins';
// [需求①] 软件数据导入导出(完整迁移备份):非笔记配置的 JSON 备份/恢复
import {
  buildSoftwareBackup,
  downloadJsonFile,
  parseSoftwareBackup,
  writeBackupLocalKeys,
} from '../utils/softwareBackup';
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

// ==================== [通知 / 关于调试] 常量 ====================
/** [通知] 自动消失时长选项(select 值=秒,0=常驻点击关闭),亦用于诊断信息文案。 */
const TOAST_DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '常驻(需点击关闭)' },
  { value: 2, label: '2 秒' },
  { value: 4, label: '4 秒' },
  { value: 6, label: '6 秒' },
  { value: 10, label: '10 秒' },
];
/** [通知] 默认自动消失时长(秒);与 App.tsx 的 DEFAULT_TOAST_DURATION_SECONDS 保持一致。 */
const DEFAULT_TOAST_DURATION = 4;
/** [通知] 出现位置:值=ToastPosition 类名后缀,label=中文。 */
const TOAST_POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'right-bottom', label: '右下' },
  { value: 'right-top', label: '右上' },
  { value: 'left-bottom', label: '左下' },
  { value: 'left-top', label: '左上' },
];
/** [通知] 默认出现位置:右下(与旧行为一致)。 */
const DEFAULT_TOAST_POSITION = 'right-bottom';
/** [关于调试] 日志级别选项(现有日志系统接入前的偏好,预留给日后日志输出)。 */
const LOG_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'error', label: '错误' },
  { value: 'warn', label: '警告' },
  { value: 'info', label: '信息' },
  { value: 'debug', label: '调试' },
];
/** [关于调试] 默认日志级别:信息。 */
const DEFAULT_LOG_LEVEL = 'info';
/** 选项 → 中文文案映射,用于「复制诊断信息」排版。 */
const TOAST_DURATION_LABELS = Object.fromEntries(TOAST_DURATION_OPTIONS.map(o => [o.value, o.label]));
const TOAST_POSITION_LABELS = Object.fromEntries(TOAST_POSITION_OPTIONS.map(o => [o.value, o.label]));
const LOG_LEVEL_LABELS = Object.fromEntries(LOG_LEVEL_OPTIONS.map(o => [o.value, o.label]));

/** 番茄钟后端插件 id(用于在插件管理里识别出番茄钟行,展示其详细设置) */
const POMODORO_PLUGIN_ID = 'pomodoro-plugin';

/** 判断某统一插件行是否为「番茄钟」(后端 id 命中或名称含「番茄钟」) */
function isPomodoroItem(item: UnifiedPlugin): boolean {
  return item.backendId === POMODORO_PLUGIN_ID || item.name.includes('番茄钟');
}

export function SettingsModal({ settings, folders, folderPresets, onFolderPresetsChange, plugins, onClose, onSave, onTogglePlugin, onResetLayout }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('appearance');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  // [M11 收尾] 模板管理:加载全量模板(内置 + 自定义,可增删自定义)
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  // [设置优化] 插件管理:后端插件本地副本 + 前端 enable 版本号 + 展开的插件详情行 id
  const [localPlugins, setLocalPlugins] = useState<Plugin[]>(plugins);
  const [fpRev, setFpRev] = useState(0);
  const [expandedPluginId, setExpandedPluginId] = useState<string>('');
  // [需求⑦] 数据管理:导出/导入结果提示 + 路径输入
  const [dataMsg, setDataMsg] = useState('');
  // [关于调试] 调试小节提示信息(复制成功 / 失败原因)
  const [debugMsg, setDebugMsg] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [importPath, setImportPath] = useState('');
  // [演变排序] 与编辑器共用的演变排序开关(读 localStorage 同键;默认关 = 仅常显时间戳)
  const [evolutionSort, setEvolutionSort] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('biji.evolution_sort');
      if (v !== null) return v === '1';
      return localStorage.getItem('biji.timeline_mode') === '1'; // 旧键迁移兜底
    } catch { return false; }
  });
  // [需求①] 软件数据导入:隐藏 file 输入,供「导入软件数据」按钮触发
  const softwareFileInputRef = useRef<HTMLInputElement>(null);
  // [zip] 整库 zip 导入:隐藏 file 输入,供「从 zip 导入」按钮触发
  const zipFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    setLocalPlugins(plugins);
  }, [plugins]);

  useEffect(() => {
    backend.getTemplates()
      .then(t => { if (t && t.length) setTemplates(t); })
      .catch(() => setTemplates(DEFAULT_TEMPLATES as NoteTemplate[]));
  }, []);

  /** [设置优化] 合并全部插件行(后端能力 + 前端入口,同能力合并「both」);fpRev 保证前端开关即时重读 */
  const mergedPlugins = useMemo<UnifiedPlugin[]>(() => {
    return buildUnifiedPluginList(localPlugins);
  }, [localPlugins, fpRev]);

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

  /**
   * [设置优化] 插件开关(设置内统一列表):
   * 后端走 onTogglePlugin(API + App 状态);前端走 localStorage 订阅、互不打架。
   * 合并行(source=both)同一能力两端一起切:关 = 能力停 + 入口停,开 = 两端都恢复。
   */
  const handleToggleInSettings = async (item: UnifiedPlugin, enabled: boolean) => {
    if (item.source === 'both' || item.source === 'backend') {
      if (item.backendId) {
        await onTogglePlugin(item.backendId, enabled);
        setLocalPlugins(prev => prev.map(p => p.id === item.backendId ? { ...p, enabled } : p));
      }
    }
    if (item.source === 'both' || item.source === 'frontend') {
      if (item.frontendId) {
        setFrontendPluginEnabled(item.frontendId, enabled);
        setFpRev(r => r + 1);
      }
    }
  };

  /** [演变排序] 设置里的演变排序开关:写 localStorage 并广播事件,让 Editor 实时重排(底层逻辑不动)。
      与工具栏按钮共用同一开关、同一存储键。 */
  const handleEvolutionSortChange = (checked: boolean) => {
    setEvolutionSort(checked);
    try {
      localStorage.setItem('biji.evolution_sort', checked ? '1' : '0');
      localStorage.removeItem('biji.timeline_mode'); // 清理旧键
    } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('biji:evolution-sort-changed', { detail: checked })); } catch { /* ignore */ }
  };

  /** 展开/收起某插件行的详情(仅番茄钟行有详情设置) */
  const toggleExpandPlugin = (item: UnifiedPlugin) => {
    setExpandedPluginId(prev => (prev === item.id ? '' : item.id));
  };

  /** [需求⑦] 导出为 Markdown 文件夹(含 git 提交;真实写盘在 Tauri 壳,web Mock 走模拟) */
  const handleExportFolder = async () => {
    try {
      const hash = await backend.gitExportAndCommit(`导出 Obsidian 文件夹 ${new Date().toISOString()}`);
      setDataMsg(hash ? `已导出为 Markdown 文件夹并提交,commit: ${hash}` : '导出完成(无 git 提交记录)');
    } catch (e) { setDataMsg('导出失败: ' + (e instanceof Error ? e.message : String(e))); }
  };

  /** [需求⑦] 导出到指定路径(全库 md) */
  const handleExportPath = async () => {
    const path = exportPath.trim();
    if (!path) { setDataMsg('请先填写导出路径'); return; }
    try {
      const r = await backend.exportMarkdown(path);
      setDataMsg(r.success ? `导出到「${path}」完成:${r.count} 条` : `导出失败:${r.error}`);
    } catch (e) { setDataMsg('导出失败: ' + (e instanceof Error ? e.message : String(e))); }
  };

  /** [需求⑦] 从 Markdown 导入 */
  const handleImportMarkdown = async () => {
    const path = importPath.trim();
    if (!path) { setDataMsg('请先填写导入路径'); return; }
    try {
      const r = await backend.importMarkdown(path);
      setDataMsg(r.success ? `从「${path}」导入完成:${r.count} 条` : `导入失败:${r.error}`);
    } catch (e) { setDataMsg('导入失败: ' + (e instanceof Error ? e.message : String(e))); }
  };

  /** [需求①] 导出软件数据:收集设置 + 全部配置 localStorage 键 → JSON 下载(不含笔记正文) */
  const handleExportSoftware = () => {
    downloadJsonFile(`biji-software-config-${new Date().toISOString().slice(0, 10)}.json`, buildSoftwareBackup(localSettings));
    setDataMsg('软件数据已导出(设置/快捷键/插件开关/顶层目录预设/布局/标签偏好等,不含笔记正文)。');
  };

  /** [需求①] 触发隐藏文件选择,读取软件数据备份 JSON */
  const handleChooseSoftwareImport = () => {
    softwareFileInputRef.current?.click();
  };

  /** [需求①] 读取所选备份文件并应用:设置落库 + 写回 localStorage → 刷新让布局/目录预设等完全生效 */
  const handleImportSoftwareFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) { setDataMsg('导入失败:未选择文件'); return; }
    try {
      const text = await file.text();
      const backup = parseSoftwareBackup(text);
      if (!backup) { setDataMsg('导入失败:不是有效的软件数据备份文件。'); return; }
      // 1) 设置/快捷键/番茄钟等通过 onSave 落库并即时生效(web Mock 为内存库,真实壳为后端)
      if (backup.settings) {
        await onSave(backup.settings);
        setLocalSettings(backup.settings); // 同步弹窗内编辑态
      }
      // 2) 其余纯 localStorage 配置逐键写回(布局/目录预设/标签偏好等)
      const n = writeBackupLocalKeys(backup.localStorage);
      setDataMsg(`软件数据导入成功:设置已恢复,已写回 ${n} 项本地配置。正在刷新以让布局/目录预设等完全生效…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setDataMsg('导入失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  /**
   * [zip 导出] 整库打包为 .zip 单文件并触发浏览器下载。
   * web Mock 下用纯前端 STORE 方式**真实生成** .zip(可被任何 zip 工具打开);
   * 真实写盘走 Tauri 壳(M6)的后端 export_notes_zip。zip 内容含每篇笔记的 .md 与清单。
   */
  const handleExportZip = async () => {
    try {
      const r = await backend.exportNotesZip();
      if (r.success && r.blob) {
        const url = URL.createObjectURL(r.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biji-notes-${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        setDataMsg(`已导出为 zip 并开始下载(web Mock 真实生成 .zip):${r.count} 条笔记。真实写盘在 Tauri 壳。`);
      } else if (r.success && r.path) {
        setDataMsg(`已导出为 zip 到「${r.path}」:${r.count} 条。`);
      } else {
        setDataMsg(`导出失败:${r.error || '未知错误'}`);
      }
    } catch (e) { setDataMsg('导出失败: ' + (e instanceof Error ? e.message : String(e))); }
  };

  /** [zip 导入] 触发隐藏文件选择,读取要导入的 .zip */
  const handleChooseZipImport = () => {
    zipFileInputRef.current?.click();
  };

  /**
   * [zip 导入] 读取所选 .zip 并导入整库。
   * web Mock 用纯前端 STORE 解析(优先清单保真还原,否则平铺 notes/*.md),
   * 读入内存库会话内生效;真实 zip 解析走 Tauri 壳(M6)。
   */
  const handleImportZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) { setDataMsg('导入失败:未选择 zip 文件'); return; }
    try {
      const r = await backend.importNotesZip(file);
      setDataMsg(r.success
        ? `从 zip 导入完成:${r.count} 条(web Mock 已读入内存库,会话内可见;刷新即重置。真实解析在 Tauri 壳)。`
        : `导入失败:${r.error || '未知错误'}`);
    } catch (err) { setDataMsg('导入失败: ' + (err instanceof Error ? err.message : String(err))); }
  };

  /**
   * [关于调试] 复制诊断信息到剪贴板(版本 / 设置关键项 / localStorage 配置键),便于排查分享。
   * 优先用 navigator.clipboard;旧浏览器 / 非安全上下文降级为临时 textarea + execCommand。
   */
  const handleCopyDiagnostics = async () => {
    const lines: string[] = [];
    lines.push('=== Biji Note 诊断信息 ===');
    lines.push('版本: 0.5.0');
    lines.push(`生成时间: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('--- 设置关键项 ---');
    const secs = localSettings.toast_duration_seconds ?? DEFAULT_TOAST_DURATION;
    const kv: Array<[string, string]> = [
      ['主题', localSettings.theme],
      ['字体大小', `${localSettings.font_size}px`],
      ['编辑器模式', localSettings.editor_mode === 'rich' ? '富文本' : 'Markdown'],
      ['自动保存', localSettings.auto_save ? '开' : '关'],
      ['同步', localSettings.sync_enabled ? '开' : '关'],
      ['工具栏位置', localSettings.toolbar_position],
      ['通知自动消失', TOAST_DURATION_LABELS[secs] ?? `${secs} 秒`],
      ['通知位置', TOAST_POSITION_LABELS[localSettings.toast_position ?? DEFAULT_TOAST_POSITION] ?? localSettings.toast_position],
      ['日志级别', LOG_LEVEL_LABELS[localSettings.log_level ?? DEFAULT_LOG_LEVEL] ?? localSettings.log_level],
    ];
    for (const [k, v] of kv) lines.push(`  ${k}: ${v}`);
    lines.push('');
    lines.push('--- localStorage 配置键 ---');
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      keys.sort();
      if (keys.length === 0) lines.push('  (空)');
      for (const k of keys) lines.push(`  ${k}`);
    } catch {
      lines.push('  (无法读取 localStorage)');
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setDebugMsg('已复制诊断信息到剪贴板');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setDebugMsg('已复制诊断信息到剪贴板');
      } catch {
        setDebugMsg('复制失败,请手动复制');
      }
    }
  };

  const tabs = [
    { id: 'appearance', label: '外观' },
    { id: 'editor', label: '编辑器' },
    { id: 'workspace', label: '工作区' },
    { id: 'shortcuts', label: '快捷键' },
    { id: 'templates', label: '模板' },
    { id: 'sync', label: '同步' },
    { id: 'data', label: '数据' },
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

            {/* [需求①] 通知设置:Toast 自动消失时长 + 出现位置(存 settings,App/Toast 读配置) */}
            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h3>通知</h3>
                <label className="settings-field">
                  <span>自动消失时长</span>
                  <select value={localSettings.toast_duration_seconds ?? DEFAULT_TOAST_DURATION} onChange={e => setLocalSettings({ ...localSettings, toast_duration_seconds: parseInt(e.target.value, 10) || 0 })}>
                    {TOAST_DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="settings-field">
                  <span>出现位置</span>
                  <select value={localSettings.toast_position ?? DEFAULT_TOAST_POSITION} onChange={e => setLocalSettings({ ...localSettings, toast_position: e.target.value as any })}>
                    {TOAST_POSITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                {/* [演变排序] 唯一的演变回归入口:开 = 时间戳基础上按创建时间重排并显示序号;关(默认)=仅常显时间戳 */}
                <label className="settings-field">
                  <span>演变排序</span>
                  <input type="checkbox" checked={evolutionSort} onChange={e => handleEvolutionSortChange(e.target.checked)} />
                </label>
                <p className="settings-hint">开:块按创建时间重排并显示序号(展示「先写哪段后写哪段」);关(默认):仅显示每段更新时间。时间戳始终显示。</p>
                <label className="settings-field">
                  <span>默认模板</span>
                  <select value={localSettings.template} onChange={e => setLocalSettings({ ...localSettings, template: e.target.value })}>
                    {DEFAULT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>

                {/* [需求②] 按顶层目录绑定模板/命名规则:与全局默认模板同属「新建笔记用什么模板」,
                    故将其分区从「模板」tab 并入「编辑器」tab(功能逻辑仍复用 folderPresets.ts)。 */}
                <h3 className="preset-heading">按顶层目录绑定模板 / 命名规则</h3>
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
                {/* [需求②] 模板 tab = 纯模板管理(内置 + 自定义增删);目录预设分区已并入「编辑器」tab */}
                <h3>模板管理</h3>
                <p className="settings-hint">内置模板不可删除;自定义模板可增/删,新建笔记时可选择。新建笔记「用什么模板」的目录级绑定请看「编辑器」tab 的「按顶层目录绑定模板 / 命名规则」。</p>
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

            {activeTab === 'data' && (
              <div className="settings-section">
                {/* [需求⑦] 数据管理:把既有导出/导入能力接进设置,做成可见可点的入口 */}
                <h3>数据管理</h3>
                <p className="settings-hint">导出/导入为 Markdown(全库或单篇)。Web 预览(Mock)下这些入口为模拟,真实写盘在 Tauri 壳中生效。单篇导出(.md / 可打印 HTML)仍可从命令面板或编辑器菜单触发。</p>

                <div className="data-location">
                  <span className="data-label">数据位置</span>
                  <span className="data-value">{localSettings.storage_path
                    ? localSettings.storage_path
                    : '浏览器 Mock(无磁盘库);Tauri 壳下此处显示 biji.db 所在路径'}</span>
                </div>

                {/* [需求①] 软件数据导入导出:非笔记配置的完整备份/恢复(跨机迁移) */}
                <h4 className="data-block-title">软件数据(配置备份)</h4>
                <p className="settings-hint">备份/还原「软件配置」:设置(主题/字号/快捷键/番茄钟时长等)、前端插件开关、顶层目录预设、面板布局、侧栏宽度、标签条偏好等本地配置。导入后自动刷新以完整生效。<strong>不含笔记正文</strong>——笔记请用下方的 Markdown 导出/导入。</p>
                <div className="data-row">
                  <button className="btn btn-secondary" onClick={handleExportSoftware}>导出软件数据(JSON)</button>
                  <button className="btn btn-secondary" onClick={handleChooseSoftwareImport}>导入软件数据(JSON)</button>
                  {/* 隐藏 file 输入:由「导入软件数据」按钮触发 */}
                  <input ref={softwareFileInputRef} type="file" accept="application/json,.json"
                    style={{ display: 'none' }} onChange={handleImportSoftwareFile} />
                </div>

                <h4 className="data-block-title">导出</h4>
                <div className="data-row">
                  <button className="btn btn-secondary" onClick={handleExportFolder}>导出为 Markdown 文件夹(含 git 提交)</button>
                </div>
                <div className="data-row">
                  <input type="text" className="data-path-input" placeholder="导出路径 (如 ~/biji-export)"
                    value={exportPath} onChange={e => setExportPath(e.target.value)} />
                  <button className="btn btn-secondary" onClick={handleExportPath}>导出到该路径</button>
                </div>

                <h4 className="data-block-title">导入</h4>
                <div className="data-row">
                  <input type="text" className="data-path-input" placeholder="导入路径 (md 文件或文件夹)"
                    value={importPath} onChange={e => setImportPath(e.target.value)} />
                  <button className="btn btn-secondary" onClick={handleImportMarkdown}>导入 Markdown</button>
                </div>

                {/* [zip] 整库 zip 压缩包迁移备份:导出/导入 .zip 单文件(与上面 Markdown 文件夹方式并存) */}
                <h4 className="data-block-title">整库 zip 压缩包(迁移备份)</h4>
                <p className="settings-hint">把全部笔记打包为单个 <strong>.zip</strong> 文件,便于整库迁移/备份;导入时选一个 .zip 即可恢复。<strong>Web 预览(Mock)</strong>下导出会真实生成一个 .zip(纯前端打包,任何 zip 工具可打开);导入会读入内存库会话内生效——真实 zip 写盘/压缩解析在 Tauri 壳(M6)。与上方 Markdown 文件夹导出/导入两种方式并存。</p>
                <div className="data-row">
                  <button className="btn btn-secondary" onClick={handleExportZip}>导出为 zip(.zip)</button>
                  <button className="btn btn-secondary" onClick={handleChooseZipImport}>从 zip 导入(.zip)</button>
                  {/* 隐藏 file 输入:由「从 zip 导入」按钮触发 */}
                  <input ref={zipFileInputRef} type="file" accept=".zip,application/zip"
                    style={{ display: 'none' }} onChange={handleImportZipFile} />
                </div>

                {dataMsg && <p className={`data-msg ${dataMsg.includes('失败') ? 'error' : ''}`}>{dataMsg}</p>}
              </div>
            )}

            {activeTab === 'plugins' && (
              <div className="settings-section">
                {/* [需求①] 插件管理在设置里要「显示完全」:合并后端/前端插件,每项含名称/来源徽标/开关;番茄钟行可展开详细设置 */}
                <h3>插件管理</h3>
                <p className="settings-hint">开关即插即用;后端能力与前端入口按能力合并成一行。点「番茄钟」可展开其详细设置(专注/休息时长与结束提醒)。保存后生效。</p>
                {mergedPlugins.length === 0 ? (
                  <p className="empty-text">正在加载插件列表…</p>
                ) : (
                  <div className="settings-plugin-list">
                    {mergedPlugins.map(item => {
                      const isPomodoro = isPomodoroItem(item);
                      const expanded = expandedPluginId === item.id;
                      return (
                        <div key={item.id} className={`settings-plugin-item ${isPomodoro ? 'is-pomodoro' : ''}`}>
                          <div className="settings-plugin-main" onClick={() => isPomodoro && toggleExpandPlugin(item)} title={isPomodoro ? '点击展开/收起番茄钟详细设置' : undefined}>
                            <div className="plugin-info">
                              <div className="plugin-name-row">
                                <span className="plugin-name">{item.name}</span>
                                <span className={`plugin-source src-${item.source}`}>
                                  {item.source === 'both' ? '能力+入口' : item.source === 'backend' ? '后端' : '前端'}
                                </span>
                              </div>
                              <span className="plugin-version">v{item.version}</span>
                              <p className="plugin-desc">{item.description}</p>
                            </div>
                            <div className="settings-plugin-actions">
                              {isPomodoro && (
                                <span className="plugin-detail-btn" onClick={e => { e.stopPropagation(); toggleExpandPlugin(item); }}>
                                  {expanded ? '收起' : '设置'}
                                </span>
                              )}
                              <label className="switch">
                                <input type="checkbox" checked={item.enabled} onChange={e => handleToggleInSettings(item, e.target.checked)} />
                                <span className="slider" />
                              </label>
                            </div>
                          </div>
                          {/* [需求④] 番茄钟插件详情设置:入口从设置 tab 移到插件管理内(仍写 settings 的 pomodoro_* 字段) */}
                          {isPomodoro && expanded && (
                            <div className="plugin-detail">
                              <div className="plugin-detail-title">番茄钟设置</div>
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-section">
                {/* [需求③] 版本号:0.5.0 = 当前功能大丰富;外壳(M6 Tauri 壳)完成后到 0.6 */}
                <h3>关于 Biji Note</h3>
                <p>版本: 0.5.0</p>
                <p>跨平台笔记编辑器</p>
                <p>Rust + Tauri + React</p>
              </div>
            )}

            {/* [需求②] 调试:不新增 tab,收敛在「关于」里。日志级别偏好 + 复制诊断信息。 */}
            {activeTab === 'about' && (
              <div className="settings-section">
                <h3>调试</h3>
                <label className="settings-field">
                  <span>日志级别</span>
                  <select value={localSettings.log_level ?? DEFAULT_LOG_LEVEL} onChange={e => setLocalSettings({ ...localSettings, log_level: e.target.value as any })}>
                    {LOG_LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <div className="settings-actions">
                  <button className="btn btn-secondary" onClick={handleCopyDiagnostics}>复制诊断信息</button>
                  {debugMsg && <span className="settings-hint">{debugMsg}</span>}
                </div>
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