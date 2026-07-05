// ============================================================
// 后端抽象接口 — 前端不直接依赖 Tauri 或任何具体后端
// 换后端只需换 Adapter 实现
// ============================================================

export interface Note {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  tags: string[];
  folder_id: string | null;
  is_encrypted: boolean;
  sync_status: 'synced' | 'pending' | 'conflict';
  deleted_at?: number | null;
  frontmatter?: NoteFrontmatter | null;
}

export interface NoteFrontmatter {
  title?: string;
  aliases?: string[];
  tags?: string[];
  created?: string;
  updated?: string;
  completed?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  color?: string | null;
  deleted_at?: number | null;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  font_size: number;
  font_family: string;
  language: string;
  sync_enabled: boolean;
  sync_provider: string | null;
  sync_mode: string;
  sync_path: string;
  sync_web_url: string;
  sync_web_token: string;
  sync_web_username: string;
  sync_web_password: string;
  encryption_enabled: boolean;
  encryption_key: string;
  auto_save: boolean;
  auto_save_interval: number;
  editor_mode: 'rich' | 'markdown';
  markdown_preview_mode: 'live' | 'edit' | 'preview';
  storage_path: string;
  template: string;
  toolbar_position: 'left' | 'right';
  custom_css: string;
  ui_custom_css: UICustomCSS;
  zoom: number;
  shortcuts: ShortcutSettings;
}

export interface UICustomCSS {
  main_content: string;
  left_sidebar: string;
  right_sidebar: string;
  editor: string;
  note_list: string;
}

export interface ShortcutSettings {
  new_note: string;
  new_folder: string;
  save: string;
  search: string;
  toggle_theme: string;
  open_settings: string;
  sync: string;
  toggle_left_sidebar: string;
  toggle_right_sidebar: string;
  toggle_graph: string;
  toggle_outline: string;
  toggle_preview_mode: string;
  toggle_editor_mode: string;
}

export interface GraphData {
  nodes: { id: string; title: string; link_count: number }[];
  edges: { source: string; target: string }[];
}

export interface SearchQuery {
  keyword?: string;
  tags?: string[];
  folder_id?: string;
  date_from?: number;
  date_to?: number;
  include_deleted?: boolean;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: string[];
  error?: string;
}

export interface SyncStatus {
  is_syncing: boolean;
  last_sync: number;
  pending: number;
  progress?: number;
  error?: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  built_in?: boolean;
}

export interface GitStatus {
  files: string[];
  clean: boolean;
}

export interface GitLogEntry {
  hash: string;
  message: string;
  date: string;
}

export interface PublishConfig {
  output_path: string;
  generator: 'Hugo' | 'Astro' | 'VitePress';
  site_name?: string;
  base_url?: string;
}

export interface PublishResult {
  success: boolean;
  output_path?: string;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  count: number;
  error?: string;
}

// ============================================================
// 后端适配器接口 — 所有后端实现必须实现此接口
// ============================================================
export interface BackendAdapter {
  // === 数据库 ===
  getNotes(includeDeleted?: boolean): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  saveNote(note: Note): Promise<void>;
  deleteNote(id: string, permanent?: boolean): Promise<void>;
  searchNotes(query: SearchQuery): Promise<Note[]>;
  getGraphData(): Promise<GraphData>;

  // === 文件夹 ===
  getFolders(includeDeleted?: boolean): Promise<Folder[]>;
  saveFolder(folder: Folder): Promise<void>;
  deleteFolder(id: string, permanent?: boolean): Promise<void>;

  // === 设置 ===
  getSettings(): Promise<AppSettings>;
  setSettings(settings: AppSettings): Promise<void>;

  // === 同步 ===
  syncStart(config: { url: string; username?: string; password?: string }): Promise<SyncResult>;
  syncStatus(): Promise<SyncStatus>;

  // === Git ===
  gitInit(): Promise<boolean>;
  gitStatus(): Promise<GitStatus>;
  gitCommit(message: string): Promise<string | null>;
  gitLog(count?: number): Promise<GitLogEntry[]>;

  // === 发布 ===
  publishSite(config: PublishConfig): Promise<PublishResult>;
  checkGenerator(generator: string): Promise<[boolean, string | null]>;

  // === 导入导出 ===
  importMarkdown(path: string): Promise<ImportResult>;
  exportMarkdown(path: string): Promise<ImportResult>;

  // === 插件 ===
  getPlugins(): Promise<Plugin[]>;
  togglePlugin(id: string, enabled: boolean): Promise<void>;

  // === 事件监听（菜单快捷键等）===
  onMenuEvent(event: string, callback: () => void): () => void;
}

// 默认快捷键
export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  new_note: 'Ctrl+N',
  new_folder: 'Ctrl+Shift+N',
  save: 'Ctrl+S',
  search: 'Ctrl+F',
  toggle_theme: 'Ctrl+Alt+T',
  open_settings: 'Ctrl+,',
  sync: 'Ctrl+Shift+S',
  toggle_left_sidebar: 'Ctrl+[',
  toggle_right_sidebar: 'Ctrl+]',
  toggle_graph: 'Ctrl+G',
  toggle_outline: 'Ctrl+O',
  toggle_preview_mode: 'Ctrl+P',
  toggle_editor_mode: 'Ctrl+E',
};

// 默认模板
export const DEFAULT_TEMPLATES = [
  { id: 'blank', name: '空白笔记', content: '' },
  { id: 'meeting', name: '会议记录', content: '# 会议记录\n\n## 会议主题\n\n## 参会人员\n\n## 会议内容\n\n## 待办事项\n- [ ] \n' },
  { id: 'daily', name: '每日日志', content: '# {{date}}\n\n## 今日完成\n\n## 遇到的问题\n\n## 明日计划\n' },
  { id: 'todo', name: '待办清单', content: '# 待办清单\n\n- [ ] \n- [ ] \n- [ ] \n' },
];
