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
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  color?: string;
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
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  fontFamily: string;
  language: string;
  syncEnabled: boolean;
  syncProvider: 'google' | 'onedrive' | 'local' | null;
  encryptionEnabled: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
}

export interface SyncProvider {
  name: string;
  authenticate: () => Promise<boolean>;
  upload: (data: Note[]) => Promise<void>;
  download: () => Promise<Note[]>;
  isAuthenticated: boolean;
}

export interface SearchQuery {
  keyword?: string;
  tags?: string[];
  folderId?: string;
  dateFrom?: number;
  dateTo?: number;
}
