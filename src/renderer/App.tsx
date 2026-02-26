import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { NoteList } from './components/NoteList';
import { SettingsModal } from './components/SettingsModal';
import { PluginManagerModal } from './components/PluginManagerModal';
import { SearchModal } from './components/SearchModal';
import type { Note, Folder, AppSettings, SearchQuery } from '@shared/types';

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
      syncStart: () => Promise<void>;
      syncStatus: () => Promise<{ lastSync: number; pending: number }>;
      getPlugins: () => Promise<any[]>;
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
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState<SearchQuery>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [notesData, foldersData, settingsData] = await Promise.all([
        window.electronAPI.getNotes(),
        window.electronAPI.getFolders(),
        window.electronAPI.getSettings(),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setSettings(settingsData);
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

  const handleNewNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '无标题',
      content: '',
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
        />
      </div>

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsChange}
        />
      )}

      {showPluginManager && (
        <PluginManagerModal onClose={() => setShowPluginManager(false)} />
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
