import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, dialog } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import { Database } from './database';
import { PluginManager } from './plugin-manager';
import { SyncManager } from './sync-manager';
import { SettingsManager } from './settings-manager';
import { EncryptionService } from './encryption';

log.initialize();
log.info('Application starting...');

/**
 * 全局异常处理器 - 捕获未处理的异常并记录日志
 */
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
  app.exit(1);
});

/**
 * 全局 Promise 拒绝处理器 - 捕获未处理的 Promise 拒绝
 */
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let database: Database;
let pluginManager: PluginManager;
let syncManager: SyncManager;
let settingsManager: SettingsManager;
let encryptionService: EncryptionService;

const isDev = !app.isPackaged;

/**
 * 创建应用主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#ffffff',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    log.info('Main window ready');
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  createMenu();
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建笔记', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-note') },
        { label: '新建文件夹', accelerator: 'CmdOrCtrl+Shift+N', click: () => mainWindow?.webContents.send('menu:new-folder') },
        { type: 'separator' },
        { label: '导入', click: () => handleImport() },
        { label: '导出', click: () => handleExport() },
        { type: 'separator' },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:open-settings') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('menu:search') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '暗黑模式', type: 'checkbox', checked: false, click: (item) => mainWindow?.webContents.send('menu:toggle-theme', item.checked) },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
    {
      label: '插件',
      submenu: [
        { label: '插件管理', click: () => mainWindow?.webContents.send('menu:plugin-manager') },
        { label: '插件市场', click: () => mainWindow?.webContents.send('menu:plugin-market') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => showAbout() },
        { label: '反馈', click: () => mainWindow?.webContents.send('menu:feedback') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  const iconPath = isDev 
    ? path.join(__dirname, '../../build/icon.png')
    : path.join(process.resourcesPath, 'icon.png');
  
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示', click: () => mainWindow?.show() },
    { label: '新建笔记', click: () => { mainWindow?.show(); mainWindow?.webContents.send('menu:new-note'); } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);

  tray.setToolTip('Biji Note');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

async function handleImport() {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: '笔记文件', extensions: ['json', 'md', 'html'] },
    ],
  });

  if (!result.canceled && result.filePaths[0]) {
    mainWindow?.webContents.send('file:import', result.filePaths[0]);
  }
}

async function handleExport() {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Markdown', extensions: ['md'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    mainWindow?.webContents.send('file:export', result.filePath);
  }
}

function showAbout() {
    dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: '关于 Biji Note',
    message: 'Biji Note',
    detail: '跨平台笔记编辑器\n支持插件系统、云同步、离线功能',
  });
}

function setupIPC() {
  ipcMain.handle('db:getNotes', async () => database.getAllNotes());
  ipcMain.handle('db:getNote', async (_, id: string) => database.getNote(id));
  ipcMain.handle('db:saveNote', async (_, note) => database.saveNote(note));
  ipcMain.handle('db:deleteNote', async (_, id: string) => database.deleteNote(id));
  ipcMain.handle('db:searchNotes', async (_, query) => database.searchNotes(query));

  ipcMain.handle('db:getFolders', async () => database.getAllFolders());
  ipcMain.handle('db:saveFolder', async (_, folder) => database.saveFolder(folder));
  ipcMain.handle('db:deleteFolder', async (_, id: string) => database.deleteFolder(id));

  ipcMain.handle('settings:get', async () => settingsManager.getSettings());
  ipcMain.handle('settings:set', async (_, settings) => settingsManager.setSettings(settings));

  ipcMain.handle('dialog:selectPath', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('storage:setPath', async (_, newPath: string) => {
    database.setStoragePath(newPath);
    await settingsManager.setSettings({ storagePath: newPath });
    return true;
  });

  ipcMain.handle('storage:getPath', async () => database.getStoragePath());

  ipcMain.handle('sync:start', async () => syncManager.sync());
  ipcMain.handle('sync:status', async () => syncManager.getStatus());

  ipcMain.handle('plugin:getAll', async () => pluginManager.getPlugins());
  ipcMain.handle('plugin:toggle', async (_, id: string, enabled: boolean) => pluginManager.togglePlugin(id, enabled));
  ipcMain.handle('plugin:install', async (_, pluginPath: string) => pluginManager.installPlugin(pluginPath));
  ipcMain.handle('plugin:uninstall', async (_, id: string) => pluginManager.uninstallPlugin(id));

  ipcMain.handle('encryption:encrypt', async (_, text: string) => encryptionService.encrypt(text));
  ipcMain.handle('encryption:decrypt', async (_, text: string) => encryptionService.decrypt(text));

  ipcMain.handle('app:getVersion', () => app.getVersion());
}

app.whenReady().then(async () => {
  log.info('Initializing services...');

  const userDataPath = app.getPath('userData');

  settingsManager = new SettingsManager(userDataPath);
  await settingsManager.init();

  encryptionService = new EncryptionService(settingsManager.getSettings().encryptionKey);

  database = new Database(userDataPath);
  await database.init();

  pluginManager = new PluginManager(userDataPath, database);
  await pluginManager.init();

  syncManager = new SyncManager(database, settingsManager);
  await syncManager.init();

  createWindow();
  createTray();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });

  log.info('Application initialized successfully');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  log.info('Application shutting down...');
  await database.close();
  await pluginManager.unloadAll();
});
