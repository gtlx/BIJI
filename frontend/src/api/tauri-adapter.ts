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
  Plugin,
  ImportResult,
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

  // ===== 发布 =====
  async publishSite(config: PublishConfig): Promise<PublishResult> {
    return invoke('publish_site', { config });
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
