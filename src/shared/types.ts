import type { ComponentType } from 'react';

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  folderId: string | null;
  isEncrypted: boolean;
  syncStatus: 'synced' | 'pending' | 'conflict';
  deletedAt?: number;
  frontmatter?: NoteFrontmatter;
}

export interface NoteFrontmatter {
  title?: string;
  aliases?: string[];
  tags?: string[];
  created?: string;
  updated?: string;
  completed?: boolean;
  [key: string]: unknown;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  color?: string;
  deletedAt?: number;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  permissions: PluginPermission[];
  entryPoint: string;
  provides?: string[];
  builtIn?: boolean;
  settingsKey?: string;
}

export interface PluginPermission {
  type: 'storage' | 'network' | 'filesystem' | 'clipboard' | 'notification';
  allowed: boolean;
}

export interface PluginAPI {
  registerCommand: (command: string, handler: (...args: unknown[]) => void) => void;
  onNoteCreated: (callback: (note: Note) => void) => void;
  onNoteUpdated: (callback: (note: Note) => void) => void;
  onNoteDeleted: (callback: (noteId: string) => void) => void;
  getNotes: () => Promise<Note[]>;
  getNote: (id: string) => Promise<Note | null>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  showNotification: (title: string, body: string) => void;
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  onSyncStatus: (callback: (status: SyncStatus) => void) => void;
  startSync: (mode: SyncMode) => Promise<SyncResult>;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  fontFamily: string;
  language: string;
  syncEnabled: boolean;
  syncProvider: SyncProviderType | null;
  syncMode: SyncMode;
  syncPath: string;
  syncWebUrl: string;
  syncWebToken: string;
  encryptionEnabled: boolean;
  encryptionKey: string;
  autoSave: boolean;
  autoSaveInterval: number;
  editorMode: EditorMode;
  markdownPreviewMode: MarkdownPreviewMode;
  storagePath: string;
  template: string;
  customCss: string;
  zoom: number;
  shortcuts: ShortcutSettings;
}

export type SyncProviderType = 'google' | 'onedrive' | 'local' | 'web';
export type SyncMode = 'incremental' | 'bidirectional';
export type EditorMode = 'rich' | 'markdown';
export type MarkdownPreviewMode = 'live' | 'edit' | 'preview';

export interface ShortcutSettings {
  newNote: string;
  newFolder: string;
  save: string;
  search: string;
  toggleTheme: string;
  openSettings: string;
  sync: string;
  toggleSidebar: string;
  toggleLeftSidebar: string;
  toggleRightSidebar: string;
  toggleGraph: string;
  toggleOutline: string;
  togglePreviewMode: string;
  toggleEditorMode: string;
  [key: string]: string;
}

export interface SyncProvider {
  name: string;
  type: SyncProviderType;
  authenticate: () => Promise<boolean>;
  upload: (data: Note[], mode: SyncMode) => Promise<SyncResult>;
  download: (mode: SyncMode) => Promise<SyncResult>;
  isAuthenticated: boolean;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: Note[];
  error?: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: number;
  pending: number;
  progress?: number;
  error?: string;
}

export interface WebSyncData {
  notes: Note[];
  folders: Folder[];
  lastModified: number;
  deviceId: string;
}

export interface SearchQuery {
  keyword?: string;
  tags?: string[];
  folderId?: string;
  dateFrom?: number;
  dateTo?: number;
  includeDeleted?: boolean;
}

export interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  icon?: string;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  newNote: 'Ctrl+N',
  newFolder: 'Ctrl+Shift+N',
  save: 'Ctrl+S',
  search: 'Ctrl+F',
  toggleTheme: 'Ctrl+Alt+T',
  openSettings: 'Ctrl+,',
  sync: 'Ctrl+Shift+S',
  toggleSidebar: 'Ctrl+B',
  toggleLeftSidebar: 'Ctrl+[',
  toggleRightSidebar: 'Ctrl+]',
  toggleGraph: 'Ctrl+G',
  toggleOutline: 'Ctrl+O',
  togglePreviewMode: 'Ctrl+P',
  toggleEditorMode: 'Ctrl+E',
};

export const DEFAULT_TEMPLATES: NoteTemplate[] = [
  { id: 'blank', name: '空白笔记', content: '' },
  { id: 'meeting', name: '会议记录', content: '# 会议记录\n\n## 会议主题\n\n## 参会人员\n\n## 会议内容\n\n## 待办事项\n- [ ] \n' },
  { id: 'daily', name: '每日日志', content: '# {{date}}\n\n## 今日完成\n\n## 遇到的问题\n\n## 明日计划\n' },
  { id: 'todo', name: '待办清单', content: '# 待办清单\n\n- [ ] \n- [ ] \n- [ ] \n' },
];

export interface NoteLink {
  id: string;
  source: Note;
  target: Note | null;
  targetTitle: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  title: string;
  linkCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface UIPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: 'ui' | 'system';
  entry: string;
  styles?: string;
  position: 'right-panel' | 'toolbar' | 'sidebar' | 'modal' | 'statusbar';
  permissions: PluginPermission[];
  data?: Record<string, unknown>;
  minAppVersion?: string;
}

export interface UIPluginConfig {
  enabled: boolean;
  settings?: Record<string, unknown>;
}

export interface UIPlugin {
  manifest: UIPluginManifest;
  component: ComponentType<any> | null;
  settings: Record<string, unknown>;
}

export interface UIPluginAPI {
  register: (component: ComponentType<any>, options?: Record<string, unknown>) => void;
  getNotes: () => Promise<Note[]>;
  getNote: (id: string) => Promise<Note | null>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  getPluginSettings: (pluginId: string) => Promise<UIPluginConfig>;
  setPluginSettings: (pluginId: string, config: UIPluginConfig) => Promise<void>;
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
  t: (key: string) => string;
}
