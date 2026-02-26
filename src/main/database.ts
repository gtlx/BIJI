import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import type { Note, Folder, SearchQuery } from '../../shared/types';

interface StoreSchema {
  notes: Note[];
  folders: Folder[];
}

export class Database {
  private store: Store<StoreSchema>;

  constructor(userDataPath: string) {
    this.store = new Store<StoreSchema>({
      name: 'biji-data',
      defaults: {
        notes: [],
        folders: [],
      },
    });
  }

  async init(): Promise<void> {
    log.info('Database initialized with electron-store');
  }

  getAllNotes(): Note[] {
    const notes = this.store.get('notes', []);
    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getNote(id: string): Note | null {
    const notes = this.store.get('notes', []);
    return notes.find(n => n.id === id) || null;
  }

  saveNote(note: Note): void {
    const notes = this.store.get('notes', []);
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

    this.store.set('notes', notes);
  }

  deleteNote(id: string): void {
    const notes = this.store.get('notes', []);
    this.store.set('notes', notes.filter(n => n.id !== id));
  }

  searchNotes(query: SearchQuery): Note[] {
    let notes = this.store.get('notes', []);

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

  getAllFolders(): Folder[] {
    return this.store.get('folders', []).sort((a, b) => a.name.localeCompare(b.name));
  }

  saveFolder(folder: Folder): void {
    const folders = this.store.get('folders', []);
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

    this.store.set('folders', folders);
  }

  deleteFolder(id: string): void {
    const notes = this.store.get('notes', []).map(n => 
      n.folderId === id ? { ...n, folderId: null } : n
    );
    this.store.set('notes', notes);

    const folders = this.store.get('folders', []);
    this.store.set('folders', folders.filter(f => f.id !== id));
  }

  getPendingSyncNotes(): Note[] {
    return this.store.get('notes', []).filter(n => n.syncStatus === 'pending');
  }

  markSynced(noteIds: string[]): void {
    const notes = this.store.get('notes', []).map(n => 
      noteIds.includes(n.id) ? { ...n, syncStatus: 'synced' as const } : n
    );
    this.store.set('notes', notes);
  }

  async close(): Promise<void> {
    log.info('Database closed');
  }
}
