import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import type { Note, Folder, SearchQuery } from '../shared/types';

export class SqliteDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(customPath?: string) {
    const basePath = customPath || this.getDefaultPath();
    this.dbPath = path.join(basePath, 'biji.db');
  }

  private getDefaultPath(): string {
    const { app } = require('electron');
    return app.getPath('userData');
  }

  async init(customPath?: string): Promise<void> {
    if (customPath) {
      this.dbPath = path.join(customPath, 'biji.db');
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
    
    log.info('SQLite database initialized at:', this.dbPath);
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '无标题',
        content TEXT DEFAULT '',
        folder_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_encrypted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        deleted_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        color TEXT,
        created_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_title TEXT NOT NULL,
        link_type TEXT DEFAULT 'wikilink',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (note_id, tag_id),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_title);
    `);
  }

  getStoragePath(): string {
    return path.dirname(this.dbPath);
  }

  setStoragePath(newPath: string): void {
    this.close();
    this.dbPath = path.join(newPath, 'biji.db');
    this.init(newPath);
  }

  private parseLinks(content: string, sourceId: string): void {
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    const insertLink = this.db.prepare(`
      INSERT OR REPLACE INTO links (id, source_id, target_title, link_type, created_at)
      VALUES (?, ?, ?, 'wikilink', ?)
    `);
    const deleteLinks = this.db.prepare('DELETE FROM links WHERE source_id = ?');
    
    const transaction = this.db.transaction(() => {
      deleteLinks.run(sourceId);
      
      while ((match = linkRegex.exec(content)) !== null) {
        insertLink.run(uuidv4(), sourceId, match[1], Date.now());
      }
    });
    
    transaction();
  }

  getAllNotes(includeDeleted = false): Note[] {
    let query = 'SELECT * FROM notes';
    if (!includeDeleted) {
      query += ' WHERE deleted_at IS NULL';
    }
    query += ' ORDER BY updated_at DESC';
    
    const rows = this.db.prepare(query).all() as any[];
    return rows.map(row => this.rowToNote(row));
  }

  getNote(id: string): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any;
    return row ? this.rowToNote(row) : null;
  }

  saveNote(note: Note): void {
    const existing = this.getNote(note.id);
    const now = Date.now();
    
    if (existing) {
      this.db.prepare(`
        UPDATE notes SET 
          title = ?, content = ?, folder_id = ?, updated_at = ?,
          is_encrypted = ?, sync_status = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        note.title,
        note.content,
        note.folderId,
        note.updatedAt || now,
        note.isEncrypted ? 1 : 0,
        note.syncStatus || 'pending',
        note.deletedAt || null,
        note.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO notes (id, title, content, folder_id, created_at, updated_at, is_encrypted, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        note.id || uuidv4(),
        note.title,
        note.content,
        note.folderId,
        note.createdAt || now,
        note.updatedAt || now,
        note.isEncrypted ? 1 : 0,
        note.syncStatus || 'synced'
      );
    }
    
    this.parseLinks(note.content, note.id);
    this.updateNoteTags(note.id, note.tags);
  }

  private updateNoteTags(noteId: string, tags: string[]): void {
    const deleteTags = this.db.prepare('DELETE FROM note_tags WHERE note_id = ?');
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)');
    const insertNoteTag = this.db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, (SELECT id FROM tags WHERE name = ?))');
    
    const transaction = this.db.transaction(() => {
      deleteTags.run(noteId);
      for (const tag of tags) {
        insertTag.run(uuidv4(), tag.toLowerCase());
        insertNoteTag.run(noteId, tag.toLowerCase());
      }
    });
    
    transaction();
  }

  deleteNote(id: string, permanent = false): void {
    if (permanent) {
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    } else {
      this.db.prepare('UPDATE notes SET deleted_at = ?, sync_status = ? WHERE id = ?')
        .run(Date.now(), 'pending', id);
    }
  }

  restoreNote(id: string): void {
    this.db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run(id);
  }

  searchNotes(query: SearchQuery): Note[] {
    let sql = 'SELECT DISTINCT n.* FROM notes n';
    const params: any[] = [];
    const conditions: string[] = ['n.deleted_at IS NULL'];

    if (query.tags && query.tags.length > 0) {
      sql += ' INNER JOIN note_tags nt ON n.id = nt.note_id INNER JOIN tags t ON nt.tag_id = t.id';
      conditions.push(`t.name IN (${query.tags.map(() => '?').join(',')})`);
      params.push(...query.tags.map(t => t.toLowerCase()));
    }

    if (query.keyword) {
      conditions.push('(n.title LIKE ? OR n.content LIKE ?)');
      const keyword = `%${query.keyword}%`;
      params.push(keyword, keyword);
    }

    if (query.folderId) {
      conditions.push('n.folder_id = ?');
      params.push(query.folderId);
    }

    if (query.dateFrom) {
      conditions.push('n.updated_at >= ?');
      params.push(query.dateFrom);
    }

    if (query.dateTo) {
      conditions.push('n.updated_at <= ?');
      params.push(query.dateTo);
    }

    if (!query.includeDeleted) {
      conditions.push('n.deleted_at IS NULL');
    }

    sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY n.updated_at DESC';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToNote(row));
  }

  getBacklinks(noteId: string): Note[] {
    const note = this.getNote(noteId);
    if (!note) return [];

    const links = this.db.prepare(`
      SELECT n.* FROM notes n
      INNER JOIN links l ON n.id = l.source_id
      WHERE l.target_title = ? AND n.id != ? AND n.deleted_at IS NULL
    `).all(note.title, noteId) as any[];

    return links.map(row => this.rowToNote(row));
  }

  getAllLinks(): { source: Note; target: Note | null; targetTitle: string }[] {
    const links = this.db.prepare(`
      SELECT l.source_id, l.target_title, l.link_type,
             s.title as source_title, s.content as source_content
      FROM links l
      INNER JOIN notes s ON l.source_id = s.id
      WHERE s.deleted_at IS NULL
    `).all() as any[];

    return links.map(link => {
      const sourceNote = this.getNote(link.source_id)!;
      const targetNote = this.findNoteByTitle(link.target_title);
      return {
        source: sourceNote,
        target: targetNote,
        targetTitle: link.target_title,
      };
    });
  }

  private findNoteByTitle(title: string): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE title = ? AND deleted_at IS NULL').get(title) as any;
    return row ? this.rowToNote(row) : null;
  }

  private rowToNote(row: any): Note {
    const tags = this.db.prepare(`
      SELECT t.name FROM tags t
      INNER JOIN note_tags nt ON t.id = nt.tag_id
      WHERE nt.note_id = ?
    `).all(row.id) as any[];
    
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isEncrypted: Boolean(row.is_encrypted),
      syncStatus: row.sync_status,
      deletedAt: row.deleted_at,
      tags: tags.map(t => t.name),
    };
  }

  private rowToFolder(row: any): Folder {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      color: row.color,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    };
  }

  getAllFolders(includeDeleted = false): Folder[] {
    let query = 'SELECT * FROM folders';
    if (!includeDeleted) {
      query += ' WHERE deleted_at IS NULL';
    }
    query += ' ORDER BY name ASC';
    
    const rows = this.db.prepare(query).all() as any[];
    return rows.map(row => this.rowToFolder(row));
  }

  saveFolder(folder: Folder): void {
    const existing = this.db.prepare('SELECT id FROM folders WHERE id = ?').get(folder.id);
    const now = Date.now();

    if (existing) {
      this.db.prepare(`
        UPDATE folders SET name = ?, parent_id = ?, color = ?, deleted_at = ?
        WHERE id = ?
      `).run(folder.name, folder.parentId, folder.color || null, folder.deletedAt || null, folder.id);
    } else {
      this.db.prepare(`
        INSERT INTO folders (id, name, parent_id, color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(folder.id || uuidv4(), folder.name, folder.parentId, folder.color || null, folder.createdAt || now);
    }
  }

  deleteFolder(id: string, permanent = false): void {
    if (permanent) {
      this.db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id);
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    } else {
      this.db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id);
      this.db.prepare('UPDATE folders SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
    }
  }

  getPendingSyncNotes(): Note[] {
    const rows = this.db.prepare(`
      SELECT * FROM notes WHERE sync_status = 'pending' AND deleted_at IS NULL
    `).all() as any[];
    return rows.map(row => this.rowToNote(row));
  }

  markSynced(noteIds: string[]): void {
    const stmt = this.db.prepare("UPDATE notes SET sync_status = 'synced' WHERE id = ?");
    const transaction = this.db.transaction(() => {
      for (const id of noteIds) {
        stmt.run(id);
      }
    });
    transaction();
  }

  importNotes(notes: Note[], mode: 'merge' | 'replace' = 'merge'): void {
    if (mode === 'replace') {
      this.db.prepare('DELETE FROM notes').run();
    }

    for (const note of notes) {
      const existing = this.getNote(note.id);
      if (!existing || note.updatedAt > existing.updatedAt) {
        this.saveNote(note);
      }
    }
  }

  exportData(): { notes: Note[]; folders: Folder[] } {
    return {
      notes: this.getAllNotes(true),
      folders: this.getAllFolders(true),
    };
  }

  close(): void {
    if (this.db) {
      this.db.close();
      log.info('Database closed');
    }
  }
}
