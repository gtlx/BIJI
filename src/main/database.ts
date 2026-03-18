import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import { app } from 'electron';
import type { Note, Folder, SearchQuery } from '../shared/types';

/**
 * 数据库管理器 - 负责笔记和文件夹的持久化存储
 * 使用本地 JSON 文件作为存储介质
 */
export class Database {
  private basePath: string;
  private notesFile: string;
  private foldersFile: string;
  private settingsPath: string;

  constructor(customPath?: string) {
    this.basePath = customPath || this.getDefaultPath();
    this.notesFile = path.join(this.basePath, 'notes.json');
    this.foldersFile = path.join(this.basePath, 'folders.json');
    this.settingsPath = path.join(this.basePath, 'settings.json');
  }

  private getDefaultPath(): string {
    return app.getPath('userData');
  }

  async init(customPath?: string): Promise<void> {
    if (customPath) {
      this.basePath = customPath;
      this.notesFile = path.join(this.basePath, 'notes.json');
      this.foldersFile = path.join(this.basePath, 'folders.json');
      this.settingsPath = path.join(this.basePath, 'settings.json');
    }

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }

    if (!fs.existsSync(this.notesFile)) {
      this.saveNotes([]);
    }
    if (!fs.existsSync(this.foldersFile)) {
      this.saveFolders([]);
    }

    log.info('Database initialized at:', this.basePath);
  }

  getStoragePath(): string {
    return this.basePath;
  }

  setStoragePath(newPath: string): void {
    this.basePath = newPath;
    this.notesFile = path.join(this.basePath, 'notes.json');
    this.foldersFile = path.join(this.basePath, 'folders.json');
    this.settingsPath = path.join(this.basePath, 'settings.json');
    this.init(newPath);
  }

  /**
   * 从文件加载笔记列表
   * @returns 笔记数组，加载失败时返回空数组
   */
  private loadNotes(): Note[] {
    try {
      const data = fs.readFileSync(this.notesFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      log.error('Failed to load notes:', error);
      return [];
    }
  }

  /**
   * 保存笔记列表到文件
   * @param notes 笔记数组
   */
  private saveNotes(notes: Note[]): void {
    fs.writeFileSync(this.notesFile, JSON.stringify(notes, null, 2), 'utf-8');
  }

  private loadFolders(): Folder[] {
    try {
      const data = fs.readFileSync(this.foldersFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      log.error('Failed to load folders:', error);
      return [];
    }
  }

  private saveFolders(folders: Folder[]): void {
    fs.writeFileSync(this.foldersFile, JSON.stringify(folders, null, 2), 'utf-8');
  }

  /**
   * 获取所有笔记
   * @param includeDeleted 是否包含已删除的笔记
   * @returns 按更新时间降序排列的笔记数组
   */
  getAllNotes(includeDeleted = false): Note[] {
    const notes = this.loadNotes();
    const filtered = includeDeleted ? notes : notes.filter(n => !n.deletedAt);
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getNote(id: string): Note | null {
    const notes = this.loadNotes();
    return notes.find(n => n.id === id) || null;
  }

  /**
   * 保存笔记 - 新建或更新
   * @param note 要保存的笔记
   */
  saveNote(note: Note): void {
    const notes = this.loadNotes();
    const index = notes.findIndex(n => n.id === note.id);
    
    const noteToSave = {
      ...note,
      id: note.id || uuidv4(),
      updatedAt: note.updatedAt || Date.now(),
      syncStatus: note.syncStatus || 'pending',
    };

    if (index >= 0) {
      notes[index] = noteToSave;
    } else {
      notes.push({
        ...noteToSave,
        createdAt: noteToSave.createdAt || Date.now(),
      });
    }

    this.saveNotes(notes);
  }

  deleteNote(id: string, permanent = false): void {
    const notes = this.loadNotes();
    
    if (permanent) {
      this.saveNotes(notes.filter(n => n.id !== id));
    } else {
      const index = notes.findIndex(n => n.id === id);
      if (index >= 0) {
        notes[index] = { ...notes[index], deletedAt: Date.now() };
        this.saveNotes(notes);
      }
    }
  }

  restoreNote(id: string): void {
    const notes = this.loadNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index >= 0) {
      notes[index] = { ...notes[index], deletedAt: undefined };
      this.saveNotes(notes);
    }
  }

  /**
   * 搜索笔记
   * @param query 搜索条件
   * @returns 匹配的笔记数组
   */
  searchNotes(query: SearchQuery): Note[] {
    let notes = this.loadNotes();

    if (!query.includeDeleted) {
      notes = notes.filter(n => !n.deletedAt);
    }

    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      notes = notes.filter(n => 
        n.title.toLowerCase().includes(keyword) || 
        n.content.toLowerCase().includes(keyword)
      );
    }

    if (query.folderId) {
      notes = notes.filter(n => n.folderId === query.folderId);
    }

    if (query.dateFrom) {
      notes = notes.filter(n => n.updatedAt >= query.dateFrom!);
    }

    if (query.dateTo) {
      notes = notes.filter(n => n.updatedAt <= query.dateTo!);
    }

    if (query.tags && query.tags.length > 0) {
      notes = notes.filter(n => 
        query.tags!.some(tag => n.tags.includes(tag))
      );
    }

    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getAllFolders(includeDeleted = false): Folder[] {
    const folders = this.loadFolders();
    const filtered = includeDeleted ? folders : folders.filter(f => !f.deletedAt);
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  saveFolder(folder: Folder): void {
    const folders = this.loadFolders();
    const index = folders.findIndex(f => f.id === folder.id);

    const folderToSave = {
      ...folder,
      id: folder.id || uuidv4(),
      createdAt: folder.createdAt || Date.now(),
    };

    if (index >= 0) {
      folders[index] = folderToSave;
    } else {
      folders.push(folderToSave);
    }

    this.saveFolders(folders);
  }

  deleteFolder(id: string, permanent = false): void {
    const notes = this.loadNotes().map(n => 
      n.folderId === id ? { ...n, folderId: null } : n
    );
    this.saveNotes(notes);

    if (permanent) {
      const folders = this.loadFolders().filter(f => f.id !== id);
      this.saveFolders(folders);
    } else {
      const folders = this.loadFolders();
      const index = folders.findIndex(f => f.id === id);
      if (index >= 0) {
        folders[index] = { ...folders[index], deletedAt: Date.now() };
        this.saveFolders(folders);
      }
    }
  }

  getPendingSyncNotes(): Note[] {
    return this.loadNotes().filter(n => n.syncStatus === 'pending' && !n.deletedAt);
  }

  markSynced(noteIds: string[]): void {
    const notes = this.loadNotes().map(n => 
      noteIds.includes(n.id) ? { ...n, syncStatus: 'synced' as const } : n
    );
    this.saveNotes(notes);
  }

  importNotes(notes: Note[], mode: 'merge' | 'replace' = 'merge'): void {
    if (mode === 'replace') {
      this.saveNotes(notes);
      return;
    }

    const existingNotes = this.loadNotes();
    const existingMap = new Map(existingNotes.map(n => [n.id, n]));

    for (const note of notes) {
      const existing = existingMap.get(note.id);
      if (!existing || note.updatedAt > existing.updatedAt) {
        existingMap.set(note.id, note);
      }
    }

    this.saveNotes(Array.from(existingMap.values()));
  }

  exportData(): { notes: Note[]; folders: Folder[] } {
    return {
      notes: this.loadNotes(),
      folders: this.loadFolders(),
    };
  }

  async close(): Promise<void> {
    log.info('Database closed');
  }
}
