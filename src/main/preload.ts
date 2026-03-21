import { contextBridge, ipcRenderer } from 'electron';
import type { Note, Folder, AppSettings, Plugin, SearchQuery } from '../shared/types';

const electronAPI = {
  getNotes: (): Promise<Note[]> => ipcRenderer.invoke('db:getNotes'),
  getNote: (id: string): Promise<Note | null> => ipcRenderer.invoke('db:getNote', id),
  saveNote: (note: Note): Promise<void> => ipcRenderer.invoke('db:saveNote', note),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteNote', id),
  searchNotes: (query: SearchQuery): Promise<Note[]> => ipcRenderer.invoke('db:searchNotes', query),

  getFolders: (): Promise<Folder[]> => ipcRenderer.invoke('db:getFolders'),
  saveFolder: (folder: Folder): Promise<void> => ipcRenderer.invoke('db:saveFolder', folder),
  deleteFolder: (id: string): Promise<void> => ipcRenderer.invoke('db:deleteFolder', id),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Partial<AppSettings>): Promise<void> => ipcRenderer.invoke('settings:set', settings),

  selectPath: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectPath'),
  setStoragePath: (path: string): Promise<boolean> => ipcRenderer.invoke('storage:setPath', path),
  getStoragePath: (): Promise<string> => ipcRenderer.invoke('storage:getPath'),

  syncStart: (): Promise<void> => ipcRenderer.invoke('sync:start'),
  syncStatus: (): Promise<{ lastSync: number; pending: number }> => ipcRenderer.invoke('sync:status'),

  getPlugins: (): Promise<Plugin[]> => ipcRenderer.invoke('plugin:getAll'),
  togglePlugin: (id: string, enabled: boolean): Promise<void> => ipcRenderer.invoke('plugin:toggle', id, enabled),
  installPlugin: (pluginPath: string): Promise<void> => ipcRenderer.invoke('plugin:install', pluginPath),
  uninstallPlugin: (id: string): Promise<void> => ipcRenderer.invoke('plugin:uninstall', id),

  encrypt: (text: string): Promise<string> => ipcRenderer.invoke('encryption:encrypt', text),
  decrypt: (text: string): Promise<string> => ipcRenderer.invoke('encryption:decrypt', text),

  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  getBacklinks: (noteId: string): Promise<Note[]> => ipcRenderer.invoke('db:getBacklinks', noteId),
  getAllLinks: (): Promise<{ source: Note; target: Note | null; targetTitle: string }[]> => ipcRenderer.invoke('db:getAllLinks'),
  getGraphData: (): Promise<{ nodes: { id: string; title: string; linkCount: number }[]; edges: { source: string; target: string }[] }> => ipcRenderer.invoke('db:getGraphData'),

  onNewNote: (callback: () => void) => {
    ipcRenderer.on('menu:new-note', callback);
    return () => ipcRenderer.removeListener('menu:new-note', callback);
  },
  onNewFolder: (callback: () => void) => {
    ipcRenderer.on('menu:new-folder', callback);
    return () => ipcRenderer.removeListener('menu:new-folder', callback);
  },
  onSearch: (callback: () => void) => {
    ipcRenderer.on('menu:search', callback);
    return () => ipcRenderer.removeListener('menu:search', callback);
  },
  onToggleTheme: (callback: (dark: boolean) => void) => {
    ipcRenderer.on('menu:toggle-theme', (_, dark) => callback(dark));
    return () => ipcRenderer.removeAllListeners('menu:toggle-theme');
  },
  onPluginManager: (callback: () => void) => {
    ipcRenderer.on('menu:plugin-manager', callback);
    return () => ipcRenderer.removeListener('menu:plugin-manager', callback);
  },
  onPluginMarket: (callback: () => void) => {
    ipcRenderer.on('menu:plugin-market', callback);
    return () => ipcRenderer.removeListener('menu:plugin-market', callback);
  },
  onImport: (callback: (path: string) => void) => {
    ipcRenderer.on('file:import', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('file:import');
  },
  onExport: (callback: (path: string) => void) => {
    ipcRenderer.on('file:export', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('file:export');
  },
  onFeedback: (callback: () => void) => {
    ipcRenderer.on('menu:feedback', callback);
    return () => ipcRenderer.removeListener('menu:feedback', callback);
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('menu:open-settings', callback);
    return () => ipcRenderer.removeListener('menu:open-settings', callback);
  },
  onGit: (callback: () => void) => {
    ipcRenderer.on('menu:git', callback);
    return () => ipcRenderer.removeListener('menu:git', callback);
  },
  onPublish: (callback: () => void) => {
    ipcRenderer.on('menu:publish', callback);
    return () => ipcRenderer.removeListener('menu:publish', callback);
  },

  onImported: (callback: (count: number) => void) => {
    ipcRenderer.on('file:imported', (_, count) => callback(count));
    return () => ipcRenderer.removeAllListeners('file:imported');
  },
  onImportError: (callback: (error: string) => void) => {
    ipcRenderer.on('file:import-error', (_, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('file:import-error');
  },

  selectExportPath: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectExportPath'),
  exportToMarkdown: (exportPath: string): Promise<{ success: boolean; count: number; error?: string }> => 
    ipcRenderer.invoke('export:markdown', exportPath),
  selectImportPath: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectImportPath'),
  importFromMarkdown: (importPath: string): Promise<{ success: boolean; count: number; error?: string }> => 
    ipcRenderer.invoke('import:markdown', importPath),

  gitInit: (): Promise<boolean> => ipcRenderer.invoke('git:init'),
  gitStatus: (): Promise<{ files: string[]; clean: boolean }> => ipcRenderer.invoke('git:status'),
  gitCommit: (message: string): Promise<{ success: boolean; hash?: string }> => ipcRenderer.invoke('git:commit', message),
  gitLog: (count?: number): Promise<Array<{ hash: string; message: string; date: string }>> => ipcRenderer.invoke('git:log', count),
  gitDiff: (file?: string): Promise<string> => ipcRenderer.invoke('git:diff', file),

  publishCheck: (generator: string): Promise<{ available: boolean; version?: string }> => 
    ipcRenderer.invoke('publish:check', generator),
  publishSite: (config: { outputPath: string; generator: string; siteName?: string; baseUrl?: string }): Promise<{ success: boolean; outputPath?: string; error?: string }> => 
    ipcRenderer.invoke('publish:site', config),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
