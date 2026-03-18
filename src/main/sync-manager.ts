import log from 'electron-log';
import type { Note } from '../shared/types';
import { SqliteDatabase } from './sqlite-database';
import { SettingsManager } from './settings-manager';

export class SyncManager {
  private database: SqliteDatabase;
  private settingsManager: SettingsManager;
  private lastSyncTime: number = 0;
  private isSyncing: boolean = false;

  constructor(database: SqliteDatabase, settingsManager: SettingsManager) {
    this.database = database;
    this.settingsManager = settingsManager;
  }

  async init(): Promise<void> {
    const settings = this.settingsManager.getSettings();
    if (settings.syncEnabled && settings.syncProvider) {
      log.info(`Sync enabled with provider: ${settings.syncProvider}`);
    }
  }

  async sync(): Promise<void> {
    const settings = this.settingsManager.getSettings();
    
    if (!settings.syncEnabled || !settings.syncProvider) {
      log.info('Sync disabled or no provider configured');
      return;
    }

    if (this.isSyncing) {
      log.info('Sync already in progress');
      return;
    }

    this.isSyncing = true;

    try {
      const pendingNotes = this.database.getPendingSyncNotes();
      
      if (pendingNotes.length > 0) {
        await this.uploadNotes(pendingNotes);
        this.database.markSynced(pendingNotes.map(n => n.id));
      }

      const remoteNotes = await this.downloadNotes();
      for (const note of remoteNotes) {
        const localNote = this.database.getNote(note.id);
        if (!localNote || note.updatedAt > localNote.updatedAt) {
          this.database.saveNote(note);
        }
      }

      this.lastSyncTime = Date.now();
      log.info(`Sync completed at ${new Date(this.lastSyncTime).toISOString()}`);
    } catch (error) {
      log.error('Sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async uploadNotes(notes: Note[]): Promise<void> {
    const settings = this.settingsManager.getSettings();
    
    switch (settings.syncProvider) {
      case 'google':
        await this.uploadToGoogleDrive(notes);
        break;
      case 'onedrive':
        await this.uploadToOneDrive(notes);
        break;
      case 'local':
        await this.uploadToLocal(notes);
        break;
    }
  }

  private async downloadNotes(): Promise<Note[]> {
    const settings = this.settingsManager.getSettings();
    
    switch (settings.syncProvider) {
      case 'google':
        return await this.downloadFromGoogleDrive();
      case 'onedrive':
        return await this.downloadFromOneDrive();
      case 'local':
        return await this.downloadFromLocal();
      default:
        return [];
    }
  }

  private async uploadToGoogleDrive(_notes: Note[]): Promise<void> {
    log.info('Uploading to Google Drive...');
  }

  private async uploadToOneDrive(_notes: Note[]): Promise<void> {
    log.info('Uploading to OneDrive...');
  }

  private async uploadToLocal(_notes: Note[]): Promise<void> {
    log.info('Uploading to local sync folder...');
  }

  private async downloadFromGoogleDrive(): Promise<Note[]> {
    log.info('Downloading from Google Drive...');
    return [];
  }

  private async downloadFromOneDrive(): Promise<Note[]> {
    log.info('Downloading from OneDrive...');
    return [];
  }

  private async downloadFromLocal(): Promise<Note[]> {
    log.info('Downloading from local sync folder...');
    return [];
  }

  getStatus(): { lastSync: number; pending: number; isSyncing: boolean } {
    const pending = this.database.getPendingSyncNotes().length;
    return {
      lastSync: this.lastSyncTime,
      pending,
      isSyncing: this.isSyncing,
    };
  }
}
