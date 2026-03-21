import log from 'electron-log';
import type { Note } from '../shared/types';

export interface WebDAVConfig {
  url: string;
  username?: string;
  password?: string;
  basePath?: string;
}

export interface WebDAVResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  error?: string;
}

export class WebDAVService {
  private config: WebDAVConfig;

  constructor(config: WebDAVConfig) {
    this.config = {
      basePath: '/biji',
      ...config,
    };
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/xml',
    };

    if (this.config.username && this.config.password) {
      const auth = btoa(`${this.config.username}:${this.config.password}`);
      headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(this.config.url, {
        method: 'PROPFIND',
        headers: this.getAuthHeaders(),
        body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
      });

      if (response.ok) {
        return { success: true };
      }

      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async listFiles(): Promise<string[]> {
    try {
      const response = await fetch(this.config.url + this.config.basePath, {
        method: 'PROPFIND',
        headers: this.getAuthHeaders(),
        body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>',
      });

      if (!response.ok) {
        return [];
      }

      const text = await response.text();
      const matches = text.match(/<d:displayname>([^<]+)<\/d:displayname>/gi) || [];
      return matches.map(m => m.replace(/<d:displayname>/gi, '').replace(/<\/d:displayname>/gi, ''));
    } catch (error) {
      log.error('[WebDAV] Failed to list files:', error);
      return [];
    }
  }

  async uploadFile(filename: string, content: string): Promise<boolean> {
    try {
      const response = await fetch(this.config.url + this.config.basePath + '/' + filename, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: content,
      });

      return response.ok || response.status === 201 || response.status === 204;
    } catch (error) {
      log.error('[WebDAV] Failed to upload file:', error);
      return false;
    }
  }

  async downloadFile(filename: string): Promise<string | null> {
    try {
      const response = await fetch(this.config.url + this.config.basePath + '/' + filename, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (response.ok) {
        return await response.text();
      }

      return null;
    } catch (error) {
      log.error('[WebDAV] Failed to download file:', error);
      return null;
    }
  }

  async deleteFile(filename: string): Promise<boolean> {
    try {
      const response = await fetch(this.config.url + this.config.basePath + '/' + filename, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      return response.ok || response.status === 204;
    } catch (error) {
      log.error('[WebDAV] Failed to delete file:', error);
      return false;
    }
  }

  async ensureBasePath(): Promise<boolean> {
    try {
      const response = await fetch(this.config.url + this.config.basePath, {
        method: 'MKCOL',
        headers: this.getAuthHeaders(),
      });

      return response.ok || response.status === 405;
    } catch (error) {
      log.error('[WebDAV] Failed to create base path:', error);
      return false;
    }
  }

  async syncNotes(
    localNotes: Note[],
    lastSyncTime: number
  ): Promise<WebDAVResult> {
    const result: WebDAVResult = {
      success: true,
      uploaded: 0,
      downloaded: 0,
    };

    try {
      await this.ensureBasePath();

      const localNoteMap = new Map(localNotes.map(n => [n.id + '.json', n]));
      const remoteFiles = await this.listFiles();

      for (const filename of remoteFiles) {
        if (!filename.endsWith('.json')) continue;

        const content = await this.downloadFile(filename);
        if (!content) continue;

        try {
          const remoteNote = JSON.parse(content) as Note;
          const localNote = localNoteMap.get(filename);

          if (remoteNote.updatedAt > lastSyncTime) {
            result.downloaded++;
          }
        } catch {
          log.warn('[WebDAV] Failed to parse remote note:', filename);
        }
      }

      for (const note of localNotes) {
        if (note.updatedAt > lastSyncTime || note.syncStatus === 'pending') {
          const filename = note.id + '.json';
          const success = await this.uploadFile(filename, JSON.stringify(note));
          if (success) {
            result.uploaded++;
          }
        }
      }

      log.info('[WebDAV] Sync completed:', result);
    } catch (error) {
      result.success = false;
      result.error = (error as Error).message;
      log.error('[WebDAV] Sync failed:', error);
    }

    return result;
  }
}
