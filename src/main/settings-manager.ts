import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import type { AppSettings } from '../../shared/types';

const defaultSettings: AppSettings = {
  theme: 'system',
  fontSize: 14,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  language: 'zh-CN',
  syncEnabled: false,
  syncProvider: null,
  syncMode: 'incremental',
  syncPath: '',
  syncWebUrl: '',
  syncWebToken: '',
  encryptionEnabled: false,
  encryptionKey: '',
  autoSave: true,
  autoSaveInterval: 30000,
  editorMode: 'markdown',
  markdownPreviewMode: 'live',
  storagePath: '',
};

export class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.settings = { ...defaultSettings };
  }

  async init(): Promise<void> {
    if (fs.existsSync(this.settingsPath)) {
      try {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        this.settings = { ...defaultSettings, ...JSON.parse(data) };
      } catch (error) {
        log.error('Failed to load settings:', error);
        this.settings = { ...defaultSettings };
      }
    }

    if (!this.settings.encryptionKey) {
      const crypto = require('crypto');
      this.settings.encryptionKey = crypto.randomBytes(32).toString('hex');
    }

    await this.save();
    log.info('Settings manager initialized');
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  async setSettings(newSettings: Partial<AppSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.save();
    log.info('Settings updated');
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }
}
