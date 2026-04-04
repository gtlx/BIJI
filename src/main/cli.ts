import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  isEncrypted: boolean;
  syncStatus: string;
  deletedAt?: number;
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  createdAt: number;
  deletedAt?: number;
}

class CliDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dataPath?: string) {
    const basePath = dataPath || this.getDefaultPath();
    this.dbPath = path.join(basePath, 'biji.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  private getDefaultPath(): string {
    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || '', 'biji-note');
    } else if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Library', 'Application Support', 'biji-note');
    } else {
      return path.join(process.env.HOME || '', '.config', 'biji-note');
    }
  }

  getAllNotes(includeDeleted = false): Note[] {
    const stmt = this.db.prepare(`
      SELECT id, title, content, folder_id as folderId, created_at as createdAt,
             updated_at as updatedAt, is_encrypted as isEncrypted, 
             sync_status as syncStatus, deleted_at as deletedAt
      FROM notes ORDER BY updated_at DESC
    `);
    const notes = stmt.all() as Note[];
    return includeDeleted ? notes : notes.filter(n => !n.deletedAt);
  }

  getNote(id: string): Note | null {
    const stmt = this.db.prepare(`
      SELECT id, title, content, folder_id as folderId, created_at as createdAt,
             updated_at as updatedAt, is_encrypted as isEncrypted, 
             sync_status as syncStatus, deleted_at as deletedAt
      FROM notes WHERE id = ?
    `);
    return stmt.get(id) as Note | null;
  }

  searchNotes(keyword: string): Note[] {
    const stmt = this.db.prepare(`
      SELECT id, title, content, folder_id as folderId, created_at as createdAt,
             updated_at as updatedAt, is_encrypted as isEncrypted, 
             sync_status as syncStatus, deleted_at as deletedAt
      FROM notes 
      WHERE (title LIKE ? OR content LIKE ?) AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `);
    const pattern = `%${keyword}%`;
    return stmt.all(pattern, pattern) as Note[];
  }

  saveNote(note: Partial<Note>): Note {
    const now = Date.now();
    const newNote: Note = {
      id: note.id || uuidv4(),
      title: note.title || 'Untitled',
      content: note.content || '',
      folderId: note.folderId || null,
      createdAt: note.createdAt || now,
      updatedAt: now,
      tags: note.tags || [],
      isEncrypted: false,
      syncStatus: 'pending',
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notes (id, title, content, folder_id, created_at, updated_at, is_encrypted, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      newNote.id,
      newNote.title,
      newNote.content,
      newNote.folderId,
      newNote.createdAt,
      newNote.updatedAt,
      newNote.isEncrypted ? 1 : 0,
      newNote.syncStatus
    );

    return newNote;
  }

  deleteNote(id: string, permanent = false): void {
    if (permanent) {
      const stmt = this.db.prepare('DELETE FROM notes WHERE id = ?');
      stmt.run(id);
    } else {
      const stmt = this.db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?');
      stmt.run(Date.now(), id);
    }
  }

  restoreNote(id: string): void {
    const stmt = this.db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?');
    stmt.run(id);
  }

  getAllFolders(includeDeleted = false): Folder[] {
    const stmt = this.db.prepare(`
      SELECT id, name, parent_id as parentId, color, created_at as createdAt, deleted_at as deletedAt
      FROM folders ORDER BY name
    `);
    const folders = stmt.all() as Folder[];
    return includeDeleted ? folders : folders.filter(f => !f.deletedAt);
  }

  getStoragePath(): string {
    return path.dirname(this.dbPath);
  }

  close(): void {
    this.db.close();
  }
}

function execSync(command: string): string {
  const { execSync: _execSync } = require('child_process');
  return _execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
}

function findAppPath(): string | null {
  const candidates = [
    '/usr/local/bin/biji',
    '/usr/bin/biji',
    path.join(__dirname, '../../dist/main/main.js'),
    path.join(__dirname, '../dist/main/main.js'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  try {
    const electronPath = execSync('which electron').trim();
    if (electronPath) return 'electron';
  } catch {}

  return null;
}

function formatNote(note: Note): string {
  const date = new Date(note.updatedAt).toLocaleString('zh-CN');
  return `
ID: ${note.id}
Title: ${note.title}
Folder: ${note.folderId || 'None'}
Updated: ${date}
---
${note.content}
`.trim();
}

function formatFolder(folder: Folder, indent = ''): string {
  return `${indent}${folder.name} (${folder.id})`;
}

export async function cli(command: string, options: string[]): Promise<void> {
  let dataPath: string | undefined;
  
  if (process.platform === 'win32') {
    dataPath = path.join(process.env.APPDATA || '', 'biji-note');
  } else if (process.platform === 'darwin') {
    dataPath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'biji-note');
  } else {
    dataPath = path.join(process.env.HOME || '', '.config', 'biji-note');
  }

  if (!fs.existsSync(dataPath)) {
    console.log('Biji Note data not found. Please run the app first to initialize.');
    console.log(`Data path: ${dataPath}`);
    process.exit(1);
  }

  const db = new CliDatabase(dataPath);

  switch (command) {
    case 'new': {
      if (options.length === 0) {
        console.error('Error: Please provide a title');
        console.log('Usage: biji new <title>');
        process.exit(1);
      }
      const title = options.join(' ');
      const note = db.saveNote({ title });
      console.log(`Created note: ${note.id}`);
      break;
    }

    case 'list': {
      const notes = db.getAllNotes();
      if (notes.length === 0) {
        console.log('No notes found.');
        break;
      }
      console.log(`Total: ${notes.length} notes\n`);
      for (const note of notes) {
        const date = new Date(note.updatedAt).toLocaleDateString('zh-CN');
        console.log(`[${date}] ${note.title} (${note.id.slice(0, 8)})`);
      }
      break;
    }

    case 'search': {
      if (options.length === 0) {
        console.error('Error: Please provide a keyword');
        console.log('Usage: biji search <keyword>');
        process.exit(1);
      }
      const keyword = options.join(' ');
      const notes = db.searchNotes(keyword);
      if (notes.length === 0) {
        console.log(`No notes found matching "${keyword}"`);
        break;
      }
      console.log(`Found ${notes.length} notes:\n`);
      for (const note of notes) {
        console.log(`- ${note.title} (${note.id.slice(0, 8)})`);
      }
      break;
    }

    case 'show': {
      if (options.length === 0) {
        console.error('Error: Please provide a note ID');
        console.log('Usage: biji show <id>');
        process.exit(1);
      }
      const note = db.getNote(options[0]);
      if (!note) {
        console.error('Note not found');
        process.exit(1);
      }
      console.log(formatNote(note));
      break;
    }

    case 'delete': {
      if (options.length === 0) {
        console.error('Error: Please provide a note ID');
        console.log('Usage: biji delete <id>');
        process.exit(1);
      }
      db.deleteNote(options[0]);
      console.log(`Note ${options[0].slice(0, 8)} moved to trash`);
      break;
    }

    case 'restore': {
      if (options.length === 0) {
        console.error('Error: Please provide a note ID');
        console.log('Usage: biji restore <id>');
        process.exit(1);
      }
      db.restoreNote(options[0]);
      console.log(`Note ${options[0].slice(0, 8)} restored`);
      break;
    }

    case 'folder': {
      const folders = db.getAllFolders();
      if (folders.length === 0) {
        console.log('No folders found.');
        break;
      }
      console.log(`Total: ${folders.length} folders\n`);
      for (const folder of folders) {
        console.log(formatFolder(folder));
      }
      break;
    }

    case 'sync': {
      console.log('Triggering sync... (Not implemented in CLI)');
      break;
    }

    case 'start': {
      const appPath = findAppPath();
      if (!appPath) {
        console.error('Biji Note not found. Please install it first.');
        process.exit(1);
      }
      console.log('Starting Biji Note...');
      const { spawn } = require('child_process');
      if (appPath === 'electron') {
        spawn(appPath, [path.join(__dirname, '../../')], { detached: true, stdio: 'ignore' });
      } else {
        spawn(appPath, [], { detached: true, stdio: 'ignore' });
      }
      console.log('Biji Note started');
      break;
    }

    case 'status': {
      const storagePath = db.getStoragePath();
      const notes = db.getAllNotes();
      const folders = db.getAllFolders();
      console.log(`
Biji Note Status
================
Storage: ${storagePath}
Notes: ${notes.length}
Folders: ${folders.length}
      `.trim());
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "biji --help" for usage');
      process.exit(1);
  }

  db.close();
}
