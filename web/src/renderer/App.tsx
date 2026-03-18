import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { NoteList } from './components/NoteList';
import { SettingsModal } from './components/SettingsModal';
import { PluginManagerModal } from './components/PluginManagerModal';
import { SearchModal } from './components/SearchModal';
import { StatusBar } from './components/StatusBar';
import type { Note, Folder, AppSettings, SearchQuery, Plugin } from '@shared/types';

declare global {
  interface Window {
    electronAPI: {
      getNotes: () => Promise<Note[]>;
      getNote: (id: string) => Promise<Note | null>;
      saveNote: (note: Note) => Promise<void>;
      deleteNote: (id: string) => Promise<void>;
      searchNotes: (query: SearchQuery) => Promise<Note[]>;
      getFolders: () => Promise<Folder[]>;
      saveFolder: (folder: Folder) => Promise<void>;
      deleteFolder: (id: string) => Promise<void>;
      getSettings: () => Promise<AppSettings>;
      setSettings: (settings: Partial<AppSettings>) => Promise<void>;
      selectPath: () => Promise<string | null>;
      setStoragePath: (path: string) => Promise<boolean>;
      getStoragePath: () => Promise<string>;
      syncStart: () => Promise<void>;
      syncStatus: () => Promise<{ lastSync: number; pending: number }>;
      getPlugins: () => Promise<Plugin[]>;
      togglePlugin: (id: string, enabled: boolean) => Promise<void>;
      installPlugin: (path: string) => Promise<void>;
      uninstallPlugin: (id: string) => Promise<void>;
      getVersion: () => Promise<string>;
      onNewNote: (callback: () => void) => () => void;
      onNewFolder: (callback: () => void) => () => void;
      onSearch: (callback: () => void) => () => void;
      onToggleTheme: (callback: (dark: boolean) => void) => () => void;
      onPluginManager: (callback: () => void) => () => void;
      onPluginMarket: (callback: () => void) => () => void;
      onFeedback: (callback: () => void) => () => void;
    };
  }
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storagePath, setStoragePath] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState<SearchQuery>({});
  const [isLoading, setIsLoading] = useState(true);

  const isPluginEnabled = (pluginId: string) => {
    const plugin = plugins.find(p => p.id === pluginId);
    return plugin?.enabled ?? false;
  };

  const loadData = useCallback(async () => {
    try {
      const [notesData, foldersData, settingsData, pluginsData, path] = await Promise.all([
        window.electronAPI.getNotes(),
        window.electronAPI.getFolders(),
        window.electronAPI.getSettings(),
        window.electronAPI.getPlugins(),
        window.electronAPI.getStoragePath(),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setSettings(settingsData);
      setPlugins(pluginsData);
      setStoragePath(path);
      applyTheme(settingsData.theme);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    let isDark = false;
    if (theme === 'dark') {
      isDark = true;
    } else if (theme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  };

  useEffect(() => {
    loadData();

    const cleanups = [
      window.electronAPI.onNewNote(() => handleNewNote()),
      window.electronAPI.onNewFolder(() => handleNewFolder()),
      window.electronAPI.onSearch(() => setShowSearch(true)),
      window.electronAPI.onToggleTheme((dark) => {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      }),
      window.electronAPI.onPluginManager(() => setShowPluginManager(true)),
    ];

    return () => cleanups.forEach(cleanup => cleanup());
  }, [loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings?.shortcuts) return;
      
      const { shortcuts } = settings;
      const key = [];
      if (e.ctrlKey) key.push('Ctrl');
      if (e.shiftKey) key.push('Shift');
      if (e.altKey) key.push('Alt');
      key.push(e.key.toUpperCase());
      const pressed = key.join('+');

      if (pressed === shortcuts.openSettings) {
        e.preventDefault();
        setShowSettings(true);
      } else if (pressed === shortcuts.newNote) {
        e.preventDefault();
        handleNewNote();
      } else if (pressed === shortcuts.newFolder) {
        e.preventDefault();
        handleNewFolder();
      } else if (pressed === shortcuts.search) {
        e.preventDefault();
        setShowSearch(true);
      } else if (pressed === shortcuts.toggleTheme) {
        e.preventDefault();
        handleSettingsChange({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
      } else if (pressed === shortcuts.sync && isPluginEnabled('sync-plugin')) {
        e.preventDefault();
        window.electronAPI.syncStart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings]);

  const handleNewNote = () => {
    const template = settings?.template || 'blank';
    let content = '';
    
    if (template === 'meeting') {
      content = '# 会议记录\n\n## 会议主题\n\n## 参会人员\n\n## 会议内容\n\n## 待办事项\n- [ ] ';
    } else if (template === 'daily') {
      const today = new Date().toLocaleDateString('zh-CN');
      content = `# ${today}\n\n## 今日完成\n\n## 遇到的问题\n\n## 明日计划\n`;
    } else if (template === 'todo') {
      content = '# 待办清单\n\n- [ ] \n- [ ] \n- [ ] \n';
    }

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '无标题',
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      folderId: selectedFolderId,
      isEncrypted: false,
      syncStatus: 'pending',
    };
    setSelectedNote(newNote);
  };

  const handleNewFolder = () => {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name: '新建文件夹',
      parentId: selectedFolderId,
      createdAt: Date.now(),
    };
    window.electronAPI.saveFolder(newFolder);
    setFolders(prev => [...prev, newFolder]);
  };

  const handleSaveNote = async (note: Note) => {
    const updatedNote = { ...note, updatedAt: Date.now(), syncStatus: 'pending' as const };
    await window.electronAPI.saveNote(updatedNote);
    
    setNotes(prev => {
      const exists = prev.find(n => n.id === note.id);
      if (exists) {
        return prev.map(n => n.id === note.id ? updatedNote : n);
      }
      return [updatedNote, ...prev];
    });
    
    setSelectedNote(updatedNote);
  };

  const handleDeleteNote = async (id: string) => {
    await window.electronAPI.deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
  };

  const handleSearch = async (query: SearchQuery) => {
    setSearchQuery(query);
    const results = await window.electronAPI.searchNotes(query);
    setNotes(results);
  };

  const handleSettingsChange = async (newSettings: Partial<AppSettings>) => {
    await window.electronAPI.setSettings(newSettings);
    const updated = { ...settings!, ...newSettings };
    setSettings(updated);
    if (newSettings.theme) {
      applyTheme(newSettings.theme);
    }
    if (newSettings.customCss) {
      applyCustomCss(newSettings.customCss);
    }
  };

  const applyCustomCss = (css: string) => {
    let styleEl = document.getElementById('custom-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  };

  const handleStoragePathChange = async (newPath: string) => {
    await window.electronAPI.setStoragePath(newPath);
    setStoragePath(newPath);
  };

  const handlePluginToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.togglePlugin(id, enabled);
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
  };

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="app-container">
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onOpenSettings={() => setShowSettings(true)}
        onOpenPluginManager={() => setShowPluginManager(true)}
      />
      <NoteList
        notes={notes.filter(n => !selectedFolderId || n.folderId === selectedFolderId)}
        selectedNoteId={selectedNote?.id}
        onSelectNote={setSelectedNote}
        onNewNote={handleNewNote}
        onSearch={handleSearch}
      />
      <div className="main-content">
        <Editor
          note={selectedNote}
          onSave={handleSaveNote}
          onDelete={handleDeleteNote}
          settings={settings}
          syncEnabled={isPluginEnabled('sync-plugin')}
        />
        <StatusBar
          storagePath={storagePath}
          syncEnabled={isPluginEnabled('sync-plugin')}
          onChangeStoragePath={handleStoragePathChange}
        />
      </div>

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          plugins={plugins}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsChange}
          onTogglePlugin={handlePluginToggle}
        />
      )}

      {showPluginManager && (
        <PluginManagerModal 
          onClose={() => setShowPluginManager(false)} 
          onPluginChange={setPlugins}
        />
      )}

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSearch={handleSearch}
        />
      )}
    </div>
  );
}
