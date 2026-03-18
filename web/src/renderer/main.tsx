import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

const mockNotes = [
  {
    id: '1',
    title: '欢迎使用 Biji Note v0.2.0',
    content: '# 欢迎\n\n这是一个跨平台笔记编辑器，支持：\n\n## 主要功能\n\n- **插件系统** - 模块化架构\n- **云同步** - 支持多种同步模式\n- **Markdown** - 实时预览\n- **本地存储** - 自定义路径\n- **快捷键** - 可自定义\n\n## 编辑模式\n\n点击工具栏按钮切换：\n- M：Markdown 模式\n- 画板：富文本模式\n\n## 预览模式\n\n- 眼睛图标：实时预览\n- 铅笔图标：笔记模式（仅编辑）\n- 眼睛（实心）：预览模式（仅查看）\n\n## 新建笔记模板\n\n可在设置中选择：空白笔记、会议记录、每日日志、待办清单',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['欢迎', '教程'],
    folderId: null,
    isEncrypted: false,
    syncStatus: 'synced' as const,
  },
  {
    id: '2',
    title: 'Markdown 语法示例',
    content: '# 标题一\n\n## 标题二\n\n### 标题三\n\n**粗体文本** 和 *斜体文本*\n\n- 列表项 1\n- 列表项 2\n\n1. 有序列表 1\n2. 有序列表 2\n\n`行内代码`\n\n```\n代码块\n```\n\n> 引用文本',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
    tags: ['Markdown', '示例'],
    folderId: null,
    isEncrypted: false,
    syncStatus: 'synced' as const,
  },
  {
    id: '3',
    title: '待办事项',
    content: '- [ ] 完成插件开发\n- [x] 实现存储优化\n- [x] 添加预览功能\n- [ ] 测试同步功能',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
    tags: ['待办'],
    folderId: null,
    isEncrypted: false,
    syncStatus: 'synced' as const,
  },
];

const mockFolders = [
  { id: 'f1', name: '工作', parentId: null, createdAt: Date.now() },
  { id: 'f2', name: '个人', parentId: null, createdAt: Date.now() },
  { id: 'f3', name: '学习', parentId: null, createdAt: Date.now() },
];

const mockPlugins = [
  { id: 'sync-plugin', name: '云同步插件', version: '1.0.0', description: '支持本地文件夹和Web同步', author: 'Biji Team', enabled: true, permissions: [], entryPoint: '' },
];

const mockSettings = {
  theme: 'light' as const,
  fontSize: 14,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  language: 'zh-CN',
  syncEnabled: false,
  syncProvider: null,
  syncMode: 'incremental' as const,
  syncPath: '',
  syncWebUrl: '',
  syncWebToken: '',
  encryptionEnabled: false,
  encryptionKey: '',
  autoSave: true,
  autoSaveInterval: 30000,
  editorMode: 'markdown' as const,
  markdownPreviewMode: 'live' as const,
  storagePath: '',
  template: 'blank',
  customCss: '',
  shortcuts: {
    newNote: 'Ctrl+N',
    newFolder: 'Ctrl+Shift+N',
    save: 'Ctrl+S',
    search: 'Ctrl+F',
    toggleTheme: 'Ctrl+Alt+T',
    openSettings: 'Ctrl+,',
    sync: 'Ctrl+Shift+S',
  },
};

const electronAPI = {
  getNotes: async () => mockNotes,
  getNote: async (id: string) => mockNotes.find(n => n.id === id) || null,
  saveNote: async (note: any) => {
    const index = mockNotes.findIndex(n => n.id === note.id);
    if (index >= 0) {
      mockNotes[index] = note;
    } else {
      mockNotes.push(note);
    }
  },
  deleteNote: async (id: string) => {
    const idx = mockNotes.findIndex(n => n.id === id);
    if (idx >= 0) mockNotes.splice(idx, 1);
  },
  searchNotes: async (query: any) => mockNotes,
  getFolders: async () => mockFolders,
  saveFolder: async (folder: any) => {
    mockFolders.push(folder);
  },
  deleteFolder: async (id: string) => {
    const idx = mockFolders.findIndex(f => f.id === id);
    if (idx >= 0) mockFolders.splice(idx, 1);
  },
  getSettings: async () => mockSettings,
  setSettings: async (settings: any) => Object.assign(mockSettings, settings),
  selectPath: async () => null,
  setStoragePath: async (path: string) => { mockSettings.storagePath = path; return true; },
  getStoragePath: async () => 'C:\\\\Users\\\\Demo\\\\Documents\\\\BijiNote',
  syncStart: async () => ({ success: true, uploaded: 0, downloaded: 0, deleted: 0, conflicts: [] }),
  syncStatus: async () => ({ lastSync: Date.now(), pending: 0, isSyncing: false }),
  getPlugins: async () => mockPlugins,
  togglePlugin: async (id: string, enabled: boolean) => {
    const plugin = mockPlugins.find(p => p.id === id);
    if (plugin) plugin.enabled = enabled;
  },
  installPlugin: async () => {},
  uninstallPlugin: async () => {},
  getVersion: () => '1.0.0-web',
  onNewNote: () => () => {},
  onNewFolder: () => () => {},
  onSearch: () => () => {},
  onToggleTheme: () => () => {},
  onPluginManager: () => () => {},
  onPluginMarket: () => () => {},
  onFeedback: () => () => {},
};

(window as any).electronAPI = electronAPI;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
