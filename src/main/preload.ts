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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
