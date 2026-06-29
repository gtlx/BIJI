import { BackendAdapter, Note, Folder, AppSettings, SearchQuery, GraphData, SyncResult, SyncStatus, GitStatus, GitLogEntry, PublishConfig, PublishResult, Plugin, ImportResult } from './backend';

// ============================================================
// Mock 适配器 — 用于开发/测试，不依赖任何后端
// ============================================================
export class MockBackend implements BackendAdapter {
  private notes: Note[] = [];
  private folders: Folder[] = [];
  private settings: AppSettings = {
    theme: 'light',
    font_size: 14,
    font_family: 'sans-serif',
    language: 'zh-CN',
    sync_enabled: false,
    sync_provider: null,
    sync_mode: 'incremental',
    sync_path: '',
    sync_web_url: '',
    sync_web_token: '',
    sync_web_username: '',
    sync_web_password: '',
    encryption_enabled: false,
    encryption_key: '',
    auto_save: true,
    auto_save_interval: 30000,
    editor_mode: 'markdown',
    markdown_preview_mode: 'live',
    storage_path: '',
    template: 'blank',
    custom_css: '',
    ui_custom_css: { main_content: '', left_sidebar: '', right_sidebar: '', editor: '', note_list: '' },
    zoom: 100,
    shortcuts: {
      new_note: 'Ctrl+N', new_folder: 'Ctrl+Shift+N', save: 'Ctrl+S', search: 'Ctrl+F',
      toggle_theme: 'Ctrl+Alt+T', open_settings: 'Ctrl+,', sync: 'Ctrl+Shift+S',
      toggle_left_sidebar: 'Ctrl+[', toggle_right_sidebar: 'Ctrl+]', toggle_graph: 'Ctrl+G',
      toggle_outline: 'Ctrl+O', toggle_preview_mode: 'Ctrl+P', toggle_editor_mode: 'Ctrl+E',
    },
  };

  async getNotes(includeDeleted = false): Promise<Note[]> {
    return this.notes.filter(n => includeDeleted || !n.deleted_at);
  }

  async getNote(id: string): Promise<Note | null> {
    return this.notes.find(n => n.id === id) || null;
  }

  async saveNote(note: Note): Promise<void> {
    const idx = this.notes.findIndex(n => n.id === note.id);
    if (idx >= 0) this.notes[idx] = note;
    else this.notes.push(note);
  }

  async deleteNote(id: string, permanent = false): Promise<void> {
    if (permanent) {
      this.notes = this.notes.filter(n => n.id !== id);
    } else {
      const note = this.notes.find(n => n.id === id);
      if (note) note.deleted_at = Date.now();
    }
  }

  async searchNotes(query: SearchQuery): Promise<Note[]> {
    let results = this.notes.filter(n => !n.deleted_at);
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(n => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw));
    }
    if (query.folder_id) results = results.filter(n => n.folder_id === query.folder_id);
    return results;
  }

  async getGraphData(): Promise<GraphData> {
    return { nodes: [], edges: [] };
  }

  async getFolders(includeDeleted = false): Promise<Folder[]> {
    return this.folders.filter(f => includeDeleted || !f.deleted_at);
  }

  async saveFolder(folder: Folder): Promise<void> {
    const idx = this.folders.findIndex(f => f.id === folder.id);
    if (idx >= 0) this.folders[idx] = folder;
    else this.folders.push(folder);
  }

  async deleteFolder(id: string, permanent = false): Promise<void> {
    if (permanent) {
      this.folders = this.folders.filter(f => f.id !== id);
    } else {
      const f = this.folders.find(f => f.id === id);
      if (f) f.deleted_at = Date.now();
    }
  }

  async getSettings(): Promise<AppSettings> { return this.settings; }
  async setSettings(settings: AppSettings): Promise<void> { this.settings = settings; }
  async syncStart(): Promise<SyncResult> { return { success: true, uploaded: 0, downloaded: 0, deleted: 0, conflicts: [] }; }
  async syncStatus(): Promise<SyncStatus> { return { is_syncing: false, last_sync: 0, pending: 0 }; }
  async gitInit(): Promise<boolean> { return true; }
  async gitStatus(): Promise<GitStatus> { return { files: [], clean: true }; }
  async gitCommit(message: string): Promise<string | null> { return null; }
  async gitLog(count?: number): Promise<GitLogEntry[]> { return []; }
  async publishSite(config: PublishConfig): Promise<PublishResult> { return { success: true }; }
  async checkGenerator(generator: string): Promise<[boolean, string | null]> { return [false, null]; }
  async importMarkdown(path: string): Promise<ImportResult> { return { success: true, count: 0 }; }
  async exportMarkdown(path: string): Promise<ImportResult> { return { success: true, count: 0 }; }
  async getPlugins(): Promise<Plugin[]> { return []; }
  async togglePlugin(id: string, enabled: boolean): Promise<void> {}
  onMenuEvent(event: string, callback: () => void): () => void { return () => {}; }
}
