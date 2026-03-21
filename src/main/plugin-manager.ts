import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';
import type { Plugin, PluginAPI, PluginPermission, Note, SyncStatus, SyncResult, SyncMode } from '../shared/types';
import { SqliteDatabase } from './sqlite-database';

interface LoadedPlugin {
  manifest: Plugin;
  instance: any;
  api: PluginAPI;
}

const BUILT_IN_PLUGINS: Plugin[] = [
  {
    id: 'pomodoro-plugin',
    name: '番茄钟',
    version: '1.0.0',
    description: '专注计时器，帮助您保持专注和高效',
    author: 'Biji Note',
    enabled: true,
    permissions: [],
    entryPoint: '',
    builtIn: true,
  },
  {
    id: 'sync-plugin',
    name: '云同步',
    version: '1.0.0',
    description: '将笔记同步到云端或本地文件夹',
    author: 'Biji Note',
    enabled: false,
    permissions: [
      { type: 'storage', allowed: true },
      { type: 'network', allowed: true },
    ],
    entryPoint: '',
    builtIn: true,
  },
];

export class PluginManager {
  private pluginsDir: string;
  private plugins: Map<string, LoadedPlugin> = new Map();
  private database: SqliteDatabase;
  private builtInPlugins: Plugin[] = [];

  constructor(userDataPath: string, database: SqliteDatabase) {
    this.pluginsDir = path.join(userDataPath, 'plugins');
    this.database = database;
  }

  async init(): Promise<void> {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    this.loadBuiltInPlugins();
    await this.loadInstalledPlugins();
    log.info('Plugin manager initialized');
  }

  private loadBuiltInPlugins(): void {
    this.builtInPlugins = BUILT_IN_PLUGINS;
    for (const plugin of this.builtInPlugins) {
      this.plugins.set(plugin.id, {
        manifest: { ...plugin },
        instance: null,
        api: this.createPluginAPI(plugin.id),
      });
    }
    log.info(`Loaded ${this.builtInPlugins.length} built-in plugins`);
  }

  private async loadInstalledPlugins(): Promise<void> {
    const dirs = fs.readdirSync(this.pluginsDir).filter(f => {
      return fs.statSync(path.join(this.pluginsDir, f)).isDirectory();
    });

    for (const dir of dirs) {
      try {
        await this.loadPlugin(dir);
      } catch (error) {
        log.error(`Failed to load plugin ${dir}:`, error);
      }
    }
  }

  private async loadPlugin(pluginDir: string): Promise<void> {
    const manifestPath = path.join(this.pluginsDir, pluginDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Plugin manifest not found');
    }

    const manifest: Plugin = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.enabled = true;

    const pluginAPI = this.createPluginAPI(manifest.id);
    manifest.entryPoint = path.join(this.pluginsDir, pluginDir, manifest.entryPoint || 'index.js');

    try {
      const pluginInstance = require(manifest.entryPoint);
      if (pluginInstance.init) {
        await pluginInstance.init(pluginAPI);
      }
      
      this.plugins.set(manifest.id, {
        manifest,
        instance: pluginInstance,
        api: pluginAPI,
      });

      log.info(`Plugin loaded: ${manifest.name} v${manifest.version}`);
    } catch (error) {
      log.error(`Failed to load plugin ${manifest.id}:`, error);
      throw error;
    }
  }

  private createPluginAPI(pluginId: string): PluginAPI {
    const self = this;

    return {
      registerCommand: (command: string, handler: (...args: unknown[]) => void) => {
        log.info(`Plugin ${pluginId} registered command: ${command}`);
      },
      onNoteCreated: (callback: (note: Note) => void) => {
        log.info(`Plugin ${pluginId} listening for note created`);
      },
      onNoteUpdated: (callback: (note: Note) => void) => {
        log.info(`Plugin ${pluginId} listening for note updated`);
      },
      onNoteDeleted: (callback: (noteId: string) => void) => {
        log.info(`Plugin ${pluginId} listening for note deleted`);
      },
      getNotes: async () => {
        self.checkPermission(pluginId, 'storage');
        return self.database.getAllNotes();
      },
      getNote: async (id: string) => {
        self.checkPermission(pluginId, 'storage');
        return self.database.getNote(id);
      },
      saveNote: async (note: Note) => {
        self.checkPermission(pluginId, 'storage');
        self.database.saveNote(note);
      },
      deleteNote: async (id: string) => {
        self.checkPermission(pluginId, 'storage');
        self.database.deleteNote(id);
      },
      showNotification: (title: string, body: string) => {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({ title, body }).show();
        }
      },
      getSettings: async () => {
        const { app } = require('electron');
        const Store = require('electron-store');
        const store = new Store();
        return store.get('settings', {});
      },
      setSettings: async (settings: Record<string, unknown>) => {
        log.info(`Plugin ${pluginId} updated settings`);
      },
      onSyncStatus: (callback: (status: SyncStatus) => void) => {
        log.info(`Plugin ${pluginId} listening for sync status`);
      },
      startSync: async (mode: SyncMode): Promise<SyncResult> => {
        log.info(`Plugin ${pluginId} started sync in ${mode} mode`);
        return { success: false, uploaded: 0, downloaded: 0, deleted: 0, conflicts: [] };
      },
    };
  }

  private checkPermission(pluginId: string, type: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const hasPermission = plugin.manifest.permissions.some(
      p => p.type === type && p.allowed
    );

    if (!hasPermission) {
      throw new Error(`Plugin ${pluginId} lacks ${type} permission`);
    }
  }

  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).map(p => ({ ...p.manifest }));
  }

  togglePlugin(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    plugin.manifest.enabled = enabled;
    log.info(`Plugin ${id} ${enabled ? 'enabled' : 'disabled'}`);
  }

  async installPlugin(pluginPath: string): Promise<void> {
    const pluginId = uuidv4();
    const destDir = path.join(this.pluginsDir, pluginId);

    fs.cpSync(pluginPath, destDir, { recursive: true });
    await this.loadPlugin(pluginId);
    log.info(`Plugin installed from ${pluginPath}`);
  }

  async uninstallPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    if (plugin.instance.destroy) {
      await plugin.instance.destroy();
    }

    this.plugins.delete(id);

    const pluginDir = path.join(this.pluginsDir, id);
    fs.rmSync(pluginDir, { recursive: true });
    log.info(`Plugin ${id} uninstalled`);
  }

  async unloadAll(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (plugin.instance && typeof plugin.instance.destroy === 'function') {
        await plugin.instance.destroy();
      }
    }
    this.plugins.clear();
  }
}
