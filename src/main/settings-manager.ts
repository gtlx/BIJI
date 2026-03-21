import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';
import type { AppSettings } from '../shared/types';

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
  syncWebUsername: '',
  syncWebPassword: '',
  encryptionEnabled: false,
  encryptionKey: '',
  autoSave: true,
  autoSaveInterval: 30000,
  editorMode: 'markdown',
  markdownPreviewMode: 'live',
  storagePath: '',
  template: 'blank',
  customCss: '',
  uiCustomCss: {
    mainContent: '',
    leftSidebar: '',
    rightSidebar: '',
    editor: '',
    noteList: '',
  },
  zoom: 100,
  shortcuts: {
    newNote: 'Ctrl+N',
    newFolder: 'Ctrl+Shift+N',
    save: 'Ctrl+S',
    search: 'Ctrl+F',
    toggleTheme: 'Ctrl+Alt+T',
    openSettings: 'Ctrl+,',
    sync: 'Ctrl+Shift+S',
    toggleLeftSidebar: 'Ctrl+[',
    toggleRightSidebar: 'Ctrl+]',
    toggleGraph: 'Ctrl+G',
    toggleOutline: 'Ctrl+O',
    togglePreviewMode: 'Ctrl+P',
    toggleEditorMode: 'Ctrl+E',
  },
};

interface UIPluginConfig {
  enabled: boolean;
  settings?: Record<string, unknown>;
}

export class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings;
  private uiPluginConfigs: Map<string, UIPluginConfig> = new Map();
  private uiPluginConfigsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.uiPluginConfigsPath = path.join(userDataPath, 'ui-plugins.json');
    this.settings = { ...defaultSettings };
  }

  async init(): Promise<void> {
    if (fs.existsSync(this.settingsPath)) {
      try {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const loadedSettings = JSON.parse(data);
        this.settings = { 
          ...defaultSettings, 
          ...loadedSettings,
          shortcuts: {
            ...defaultSettings.shortcuts,
            ...(loadedSettings.shortcuts || {}),
          }
        };
      } catch (error) {
        log.error('Failed to load settings:', error);
        this.settings = { ...defaultSettings };
      }
    }

    if (!this.settings.encryptionKey) {
      this.settings.encryptionKey = crypto.randomBytes(32).toString('hex');
    }

    if (fs.existsSync(this.uiPluginConfigsPath)) {
      try {
        const data = fs.readFileSync(this.uiPluginConfigsPath, 'utf-8');
        const configs = JSON.parse(data) as Record<string, UIPluginConfig>;
        this.uiPluginConfigs = new Map(Object.entries(configs));
      } catch (error) {
        log.error('Failed to load UI plugin configs:', error);
      }
    }

    await this.save();
    log.info('Settings manager initialized');
  }

  getUIPluginConfig(pluginId: string): UIPluginConfig {
    return this.uiPluginConfigs.get(pluginId) || { enabled: false, settings: {} };
  }

  async setUIPluginConfig(pluginId: string, config: UIPluginConfig): Promise<void> {
    this.uiPluginConfigs.set(pluginId, config);
    await this.saveUIPluginConfigs();
    log.info(`UI plugin config updated: ${pluginId}`);
  }

  private async saveUIPluginConfigs(): Promise<void> {
    const configs = Object.fromEntries(this.uiPluginConfigs);
    fs.writeFileSync(this.uiPluginConfigsPath, JSON.stringify(configs, null, 2));
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
