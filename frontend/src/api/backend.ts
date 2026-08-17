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
  /** 检索双模式(M2):title 只搜标题 / content 按块命中;缺省兼容旧行为 */
  mode?: 'title' | 'content';
}

// ============================================================
// M2 块级存储 — 块 / 块历史 / 块级命中 类型
// ============================================================

export type BlockType = 'paragraph' | 'heading' | 'list_item' | 'quote' | 'code' | 'other';

/** 块:笔记内容的最小单元,带创建/更新时间戳(BIJI 灵魂:块时间戳演变) */
export interface NoteBlock {
  id: string;
  note_id: string;
  parent_id: string | null;
  type: BlockType;
  content: string;
  created_at: number;
  updated_at: number;
  sort_order: number;
}

/** 块历史快照:每次变更(create/update/delete)一条,内容快照 + 时间 */
export interface BlockHistoryEntry {
  id: string;
  block_id: string | null;
  content_snapshot: string;
  changed_at: number;
  change_type: 'create' | 'update' | 'delete';
}

/** 内容模式搜索的块级命中:命中块 + 所在笔记 + 片段 */
export interface BlockSearchResult {
  block_id: string;
  note_id: string;
  note_title: string;
  content: string;
  updated_at: number;
}

/** [M3.5a 日历热力图] 按日统计的块活跃(日期 "YYYY-MM-DD" + 当日创建/更新块数) */
export interface BlockActivity {
  date: string;
  created: number;
  updated: number;
}

/** [M3.5a 反向链接(块级)] 引用某笔记的块:来源笔记 + 片段 + 块时间戳 */
export interface BlockBacklink {
  block_id: string;
  source_note_id: string;
  source_note_title: string;
  content: string;
  created_at: number;
  updated_at: number;
}

/** [M3.5a 标签树] 标签及笔记数 */
export interface TagCount {
  name: string;
  count: number;
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

  // === 块(M2 块级存储) ===
  /** 新建块(类型由内容推断,追加到笔记末尾) */
  createBlock(input: { note_id: string; content: string; parent_id?: string | null }): Promise<NoteBlock>;
  /** 更新块内容:盖 updated_at + 写历史快照 */
  updateBlock(id: string, content: string): Promise<NoteBlock>;
  deleteBlock(id: string, permanent?: boolean): Promise<void>;
  /** 重排笔记内块顺序 */
  reorderBlocks(noteId: string, orderedIds: string[]): Promise<void>;
  /** 按 sort_order 返回笔记块序列(含每块 created_at/updated_at) */
  getNoteBlocks(noteId: string): Promise<NoteBlock[]>;
  /** 块历史时间线(新→旧) */
  getBlockHistory(blockId: string): Promise<BlockHistoryEntry[]>;
  /** 内容模式搜索:按块命中(命中块 + 笔记 + 片段) */
  searchBlocks(keyword: string): Promise<BlockSearchResult[]>;
  /** 笔记保存时后端拆块入库(整篇编辑模式:内容 → 块序列 diff,返回变更块数) */
  syncNoteBlocks(noteId: string, content: string): Promise<number>;

  // === [M3.5a 日历热力图] ===
  /** 按日统计块活跃:返回 [{date, created, updated}] (毫秒范围,本地日) */
  getBlockActivity(dateFrom: number, dateTo: number): Promise<BlockActivity[]>;
  /** 取范围内有写入的块(创建或更新),供日历点天看当天写了什么 */
  getBlocksInRange(dateFrom: number, dateTo: number): Promise<BlockSearchResult[]>;

  // === [M3.5a 反向链接(块级)] ===
  /** 引用某笔记的块列表(来源笔记 + 片段 + 块时间戳) */
  getBlockBacklinks(noteId: string): Promise<BlockBacklink[]>;

  // === [M3.5a 标签树/过滤] ===
  /** 全部标签及笔记数(排除已删除笔记) */
  getTags(): Promise<TagCount[]>;
  /** 按标签列出笔记(过滤 NoteList) */
  getNotesByTag(tag: string): Promise<Note[]>;

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
