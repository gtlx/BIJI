import {
  BackendAdapter,
  Note,
  Folder,
  AppSettings,
  SearchQuery,
  GraphData,
  SyncResult,
  SyncStatus,
  GitStatus,
  GitLogEntry,
  PublishConfig,
  PublishResult,
  PublishPreviewResult,
  Plugin,
  ImportResult,
  ZipExportResult,
  BlockActivity,
  BlockSearchResult,
  BlockBacklink,
  TagCount,
} from './backend';

// ============================================================
// Tauri 后端适配器 — 通过 Tauri IPC 与 Rust 后端通信
// 前端任何地方都通过 BackendAdapter 接口调用，不直接 invoke
// ============================================================

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 动态导入 @tauri-apps/api，如果不在 Tauri 环境中则降级
  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    console.warn(`[TauriAdapter] invoke(${cmd}) failed, switching to mock:`, e);
    throw e;
  }
}

async function listen(event: string, cb: () => void): Promise<() => void> {
  try {
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return await tauriListen(event, cb);
  } catch {
    return () => {};
  }
}

export class TauriBackend implements BackendAdapter {
  // ===== 笔记 =====
  async getNotes(includeDeleted = false): Promise<Note[]> {
    return invoke('get_notes', { includeDeleted });
  }
  async getNote(id: string): Promise<Note | null> {
    return invoke('get_note', { id });
  }
  async saveNote(note: Note): Promise<void> {
    return invoke('save_note', { note });
  }
  async deleteNote(id: string, permanent = false): Promise<void> {
    return invoke('delete_note', { id, permanent });
  }
  async searchNotes(query: SearchQuery): Promise<Note[]> {
    return invoke('search_notes', { query });
  }
  async getGraphData(): Promise<GraphData> {
    return invoke('get_graph_data');
  }

  // ===== 块(M2 占位:Tauri 命令尚未接入,报错提示;同 Mock 语义待 M3) =====
  private blockNotImplemented(): never {
    throw new Error('块 API 未实现(M2 占位):Tauri 块命令(save_note 拆块/块 CRUD/历史)待接入,当前请用 Web/Mock 模式体验 M2 块级存储');
  }
  async createBlock(): Promise<never> { return this.blockNotImplemented(); }
  async updateBlock(): Promise<never> { return this.blockNotImplemented(); }
  async deleteBlock(): Promise<never> { return this.blockNotImplemented(); }
  async reorderBlocks(): Promise<never> { return this.blockNotImplemented(); }
  async getNoteBlocks(): Promise<never> { return this.blockNotImplemented(); }
  async getBlockHistory(): Promise<never> { return this.blockNotImplemented(); }
  async searchBlocks(): Promise<never> { return this.blockNotImplemented(); }
  async syncNoteBlocks(): Promise<never> { return this.blockNotImplemented(); }

  // ===== [M3.5a] 日历热力图 / 反向链接 / 标签树 (Tauri 命令待 M6 接入,先走 invoke 命名) =====
  async getBlockActivity(dateFrom: number, dateTo: number): Promise<BlockActivity[]> {
    return invoke('get_block_activity', { dateFrom, dateTo });
  }
  async getBlocksInRange(dateFrom: number, dateTo: number): Promise<BlockSearchResult[]> {
    return invoke('get_blocks_in_range', { dateFrom, dateTo });
  }
  async getBlockBacklinks(noteId: string): Promise<BlockBacklink[]> {
    return invoke('get_block_backlinks', { noteId });
  }
  async getTags(): Promise<TagCount[]> {
    return invoke('get_tags');
  }
  async getNotesByTag(tag: string): Promise<Note[]> {
    return invoke('get_notes_by_tag', { tag });
  }

  // ===== 文件夹 =====
  async getFolders(includeDeleted = false): Promise<Folder[]> {
    return invoke('get_folders', { includeDeleted });
  }
  async saveFolder(folder: Folder): Promise<void> {
    return invoke('save_folder', { folder });
  }
  async deleteFolder(id: string, permanent = false): Promise<void> {
    return invoke('delete_folder', { id, permanent });
  }

  // ===== 设置 =====
  async getSettings(): Promise<AppSettings> {
    return invoke('get_settings');
  }
  async setSettings(settings: AppSettings): Promise<void> {
    return invoke('set_settings', { settings });
  }

  // ===== 同步 =====
  async syncStart(config: { url: string; username?: string; password?: string }): Promise<SyncResult> {
    return invoke('sync_start', { config });
  }
  async syncStatus(): Promise<SyncStatus> {
    return invoke('sync_status');
  }

  // ===== Git =====
  async gitInit(): Promise<boolean> {
    return invoke('git_init');
  }
  async gitStatus(): Promise<GitStatus> {
    return invoke('git_status');
  }
  async gitCommit(message: string): Promise<string | null> {
    return invoke('git_commit', { message });
  }
  async gitLog(count = 20): Promise<GitLogEntry[]> {
    return invoke('git_log', { count });
  }
  async gitExportAndCommit(message: string): Promise<string | null> {
    return invoke('git_export_commit', { message });
  }

  // ===== 发布 =====
  async publishSite(config: PublishConfig): Promise<PublishResult> {
    return invoke('publish_site', { config });
  }
  async previewSite(config: PublishConfig): Promise<PublishPreviewResult> {
    return invoke('preview_site', { config });
  }
  async checkGenerator(generator: string): Promise<[boolean, string | null]> {
    return invoke('check_generator', { generator });
  }

  // ===== 导入导出 =====
  async importMarkdown(path: string): Promise<ImportResult> {
    return invoke('import_markdown', { path });
  }
  async exportMarkdown(path: string): Promise<ImportResult> {
    return invoke('export_markdown', { path });
  }

  // ===== [zip] 整库 zip 导入导出(真实写盘/解析在 Tauri 壳 M6) =====
  /** [zip] 整库导出为 .zip:走后端 export_notes_zip(把库打包写出);Tauri 壳 M6 接入后生效 */
  async exportNotesZip(): Promise<ZipExportResult> {
    return invoke('export_notes_zip');
  }
  /** [zip] 从 .zip 导入整库:把所选文件字节传给后端 import_notes_zip 解析入库;Tauri 壳 M6 接入后生效 */
  async importNotesZip(zip: Blob | File): Promise<ImportResult> {
    // 当前壳尚未接入大文件字节传输;此处先把文件读成字节数组,便于 M6 命令对接
    const bytes = Array.from(new Uint8Array(await zip.arrayBuffer()));
    return invoke('import_notes_zip', { data: bytes });
  }

  // ===== [M3.5b] 回收站 / 模板 / 导出(Tauri 命令待 M6 接入,先走 invoke 命名) =====
  async getTrashNotes(): Promise<Note[]> { return invoke('get_trash_notes'); }
  async getTrashBlocks(): Promise<import('./backend').TrashBlock[]> { return invoke('get_trash_blocks'); }
  async restoreNote(id: string): Promise<void> { return invoke('restore_note', { id }); }
  async restoreBlock(id: string): Promise<void> { return invoke('restore_block', { id }); }
  async permanentDeleteNote(id: string): Promise<void> { return invoke('permanent_delete_note', { id }); }
  async permanentDeleteBlock(id: string): Promise<void> { return invoke('permanent_delete_block', { id }); }
  async emptyTrash(): Promise<void> { return invoke('empty_trash'); }
  async getTemplates(): Promise<import('./backend').NoteTemplate[]> { return invoke('get_templates'); }
  async createTemplate(name: string, content: string): Promise<import('./backend').NoteTemplate> {
    return invoke('create_template', { name, content });
  }
  async deleteTemplate(id: string): Promise<boolean> { return invoke('delete_template', { id }); }
  async exportNoteMarkdown(noteId: string): Promise<string> { return invoke('export_note_markdown', { noteId }); }
  async exportNoteHtml(noteId: string): Promise<string> { return invoke('export_note_html', { noteId }); }

  // ===== 插件 =====
  async getPlugins(): Promise<Plugin[]> {
    return invoke('get_plugins');
  }
  async togglePlugin(id: string, enabled: boolean): Promise<void> {
    return invoke('toggle_plugin', { id, enabled });
  }

  // ===== 事件监听 =====
  onMenuEvent(event: string, callback: () => void): () => void {
    let unlisten: (() => void) | undefined;
    listen(`menu:${event}`, callback).then(u => { unlisten = u; });
    return () => unlisten?.();
  }
}
