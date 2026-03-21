import { useState, useEffect, useCallback } from 'react';
import { Sidebar, type SidebarButton } from './components/Sidebar';
import { Editor } from './components/Editor';
import { NoteList } from './components/NoteList';
import { SettingsModal } from './components/SettingsModal';
import { SearchModal } from './components/SearchModal';
import { StatusBar } from './components/StatusBar';
import { GraphView } from './components/GraphView';
import { Toolbar } from './components/Toolbar';
import { ToastContainer } from './components/Toast';
import { RightPanel } from './components/RightPanel';
import { GitPanel } from './components/GitPanel';
import { PublishPanel } from './components/PublishPanel';
import { DEFAULT_TEMPLATES } from '@shared/types';
import type { Note, Folder, AppSettings, SearchQuery, Plugin } from '@shared/types';
import './App.css';

interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

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
      getBacklinks: (noteId: string) => Promise<Note[]>;
      getAllLinks: () => Promise<{ source: Note; target: Note | null; targetTitle: string }[]>;
      getGraphData: () => Promise<{ nodes: { id: string; title: string; linkCount: number }[]; edges: { source: string; target: string }[] }>;
      onNewNote: (callback: () => void) => () => void;
      onNewFolder: (callback: () => void) => () => void;
      onSearch: (callback: () => void) => () => void;
      onToggleTheme: (callback: (dark: boolean) => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
      onFeedback: (callback: () => void) => () => void;
      selectExportPath: () => Promise<string | null>;
      exportToMarkdown: (path: string) => Promise<{ success: boolean; count: number; error?: string }>;
      selectImportPath: () => Promise<string | null>;
      importFromMarkdown: (path: string) => Promise<{ success: boolean; count: number; error?: string }>;
      onImported: (callback: (count: number) => void) => () => void;
      onImportError: (callback: (error: string) => void) => () => void;
      gitInit: () => Promise<boolean>;
      gitStatus: () => Promise<{ files: string[]; clean: boolean }>;
      gitCommit: (message: string) => Promise<{ success: boolean; hash?: string }>;
      gitLog: (count?: number) => Promise<Array<{ hash: string; message: string; date: string }>>;
      gitDiff: (file?: string) => Promise<string>;
      gitAddAll: () => Promise<boolean>;
      publishCheck: (generator: string) => Promise<{ available: boolean; version?: string }>;
      publishSite: (config: { outputPath: string; generator: string; siteName?: string; baseUrl?: string }) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
      getUIPlugins: () => Promise<import('@shared/types').UIPluginManifest[]>;
      getUIPluginConfig: (pluginId: string) => Promise<import('@shared/types').UIPluginConfig>;
      setUIPluginConfig: (pluginId: string, config: import('@shared/types').UIPluginConfig) => Promise<void>;
      installUIPlugin: (path: string) => Promise<import('@shared/types').UIPluginManifest | null>;
      uninstallUIPlugin: (pluginId: string) => Promise<boolean>;
      selectPluginPath: () => Promise<string | null>;
      loadUIPluginCode: (pluginId: string) => Promise<string | null>;
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
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showGraph, setShowGraph] = useState(true);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [scrollToHeading, setScrollToHeading] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'markdown' | 'rich'>('markdown');
  const [previewMode, setPreviewMode] = useState<'live' | 'edit' | 'preview'>('live');
  const [sidebarButtons, setSidebarButtons] = useState<SidebarButton[]>([
    { id: 'files', icon: 'files', label: '文件', visible: true },
    { id: 'search', icon: 'search', label: '搜索', visible: true },
    { id: 'tags', icon: 'tags', label: '标签', visible: false },
  ]);
  const [toolbarButtons, setToolbarButtons] = useState<import('./components/Toolbar').ToolbarButton[]>([
    { id: 'graph', icon: 'graph', label: '图谱' },
    { id: 'git', icon: 'git', label: 'Git' },
    { id: 'publish', icon: 'publish', label: '发布' },
  ]);


  useEffect(() => {
    if (scrollToHeading) {
      const timer = setTimeout(() => setScrollToHeading(null), 100);
      return () => clearTimeout(timer);
    }
  }, [scrollToHeading]);

  const [isLoading, setIsLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [graphKey, setGraphKey] = useState(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const isPluginEnabled = (pluginId: string) => {
    const plugin = plugins.find(p => p.id === pluginId);
    return plugin?.enabled ?? false;
  };

  const loadData = useCallback(async () => {
    try {
      const [notesData, foldersData, settingsData, pluginsData] = await Promise.all([
        window.electronAPI.getNotes(),
        window.electronAPI.getFolders(),
        window.electronAPI.getSettings(),
        window.electronAPI.getPlugins(),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setSettings(settingsData);
      setPlugins(pluginsData);
      applyTheme(settingsData.theme);
      setZoom(settingsData.zoom);
    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('加载数据失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    let isDark = false;
    if (theme === 'dark') {
      isDark = true;
    } else if (theme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  };

  const applyZoom = (zoomLevel: number) => {
    document.body.style.zoom = `${zoomLevel}%`;
    document.body.style.transform = `scale(${zoomLevel / 100})`;
    document.body.style.transformOrigin = 'top left';
    document.body.style.width = `${10000 / zoomLevel}%`;
    document.body.style.height = `${10000 / zoomLevel}%`;
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
      window.electronAPI.onOpenSettings(() => setShowSettings(true)),
      window.electronAPI.onImported((count) => {
        showToast(`已导入 ${count} 篇笔记`);
        loadData();
        setGraphKey(k => k + 1);
      }),
      window.electronAPI.onImportError((error) => {
        showToast(`导入失败: ${error}`, 'error');
      }),
    ];

    return () => cleanups.forEach(cleanup => cleanup());
  }, [loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings?.shortcuts) return;
      
      const { shortcuts } = settings;
      const key: string[] = [];
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
      } else if (pressed === shortcuts.toggleSidebar) {
        e.preventDefault();
      } else if (pressed === shortcuts.toggleGraph) {
        e.preventDefault();
        setShowGraph(prev => !prev);
      } else if (pressed === shortcuts.togglePreviewMode) {
        e.preventDefault();
        setPreviewMode(prev => {
          const modes: ('live' | 'edit' | 'preview')[] = ['live', 'edit', 'preview'];
          const idx = modes.indexOf(prev);
          return modes[(idx + 1) % modes.length];
        });
      } else if (pressed === shortcuts.toggleEditorMode) {
        e.preventDefault();
        setEditorMode(prev => prev === 'markdown' ? 'rich' : 'markdown');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, isPluginEnabled]);

  useEffect(() => {
    applyZoom(zoom);
  }, [zoom]);

  const handleNewNote = async () => {
    const templateId = settings?.template || 'blank';
    const template = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    
    let content = template?.content || '';
    if (templateId === 'daily') {
      const today = new Date().toLocaleDateString('zh-CN');
      content = content.replace('{{date}}', today);
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
    
    await window.electronAPI.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);
    showToast('已创建新笔记');
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
    showToast('已创建新文件夹');
  };

  const handleSidebarButtonsChange = (newButtons: SidebarButton[]) => {
    setSidebarButtons(newButtons);
  };

  const handleToggleSidebarButton = (buttonId: string) => {
    switch (buttonId) {
      case 'search':
        setShowSearch(true);
        break;
      case 'files':
        break;
      case 'tags':
        break;
      case 'backlinks':
        break;
      case 'graph':
        setShowGraph(prev => !prev);
        break;
      case 'git':
        setShowGitPanel(prev => !prev);
        break;
      case 'publish':
        setShowPublishPanel(prev => !prev);
        break;
      default:
        break;
    }
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
    if (showGraph) {
      setGraphKey(k => k + 1);
    }
    showToast('笔记已保存');
  };

  const handleDeleteNote = async (id: string) => {
    await window.electronAPI.deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
    showToast('笔记已删除');
  };

  const handleSearch = async (query: SearchQuery) => {
    const results = await window.electronAPI.searchNotes(query);
    setNotes(results);
    showToast(`找到 ${results.length} 条结果`);
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
    if (newSettings.zoom) {
      setZoom(newSettings.zoom);
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

  const handlePluginToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.togglePlugin(id, enabled);
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
  };

  const handlePluginClick = (pluginId: string) => {
    showToast(`插件 ${pluginId} 功能开发中`);
  };

  const handleLinkClick = (noteTitle: string) => {
    const linkedNote = notes.find(n => n.title === noteTitle);
    if (linkedNote) {
      setSelectedNote(linkedNote);
      setShowGraph(false);
    } else {
      showToast(`未找到笔记: ${noteTitle}`, 'info');
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
        onNewNote={handleNewNote}
        onNewFolder={handleNewFolder}
        buttons={sidebarButtons}
        onButtonsChange={handleSidebarButtonsChange}
        onToggleButton={handleToggleSidebarButton}
      />
      <NoteList
        notes={notes.filter(n => !selectedFolderId || n.folderId === selectedFolderId)}
        selectedNoteId={selectedNote?.id}
        onSelectNote={setSelectedNote}
        onNewNote={handleNewNote}
        onSearch={handleSearch}
      />
      <div className="main-content">
        {showGraph ? (
          <GraphView
            key={graphKey}
            onSelectNote={(noteId) => {
              const note = notes.find(n => n.id === noteId);
              if (note) {
                setSelectedNote(note);
                setShowGraph(false);
              }
            }}
            currentNoteId={selectedNote?.id}
            onRefresh={() => setGraphKey(k => k + 1)}
          />
        ) : showGitPanel ? (
          <GitPanel onClose={() => setShowGitPanel(false)} />
        ) : showPublishPanel ? (
          <PublishPanel onClose={() => setShowPublishPanel(false)} />
        ) : (
          <Editor
            note={selectedNote}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
            settings={settings}
            syncEnabled={isPluginEnabled('sync-plugin')}
            onLinkClick={handleLinkClick}
            scrollToHeading={scrollToHeading}
            externalEditorMode={editorMode}
            externalPreviewMode={previewMode}
            onEditorModeChange={setEditorMode}
            onPreviewModeChange={setPreviewMode}
          />
        )}
        <StatusBar
          syncEnabled={isPluginEnabled('sync-plugin')}
        />
      </div>

      {selectedNote && !showGraph && !showGitPanel && !showPublishPanel && (
        <RightPanel 
          content={selectedNote?.content || ''} 
          onHeadingClick={(heading, level) => level > 0 ? setScrollToHeading(heading) : null}
          onToggle={() => {}}
          onPropertiesClick={() => showToast('属性面板开发中', 'info')}
        />
      )}

      <Toolbar
        buttons={toolbarButtons}
        onButtonOrderChange={setToolbarButtons}
        onPluginClick={handlePluginClick}
        onGraphClick={() => {
          setShowGraph(!showGraph);
          if (!showGraph) {
            setShowGitPanel(false);
            setShowPublishPanel(false);
          }
        }}
        onGitClick={() => {
          setShowGitPanel(!showGitPanel);
          if (!showGitPanel) {
            setShowGraph(false);
            setShowPublishPanel(false);
          }
        }}
        onPublishClick={() => {
          setShowPublishPanel(!showPublishPanel);
          if (!showPublishPanel) {
            setShowGraph(false);
            setShowGitPanel(false);
          }
        }}
        isGraphActive={showGraph}
        isGitActive={showGitPanel}
        isPublishActive={showPublishPanel}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          plugins={plugins}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsChange}
          onTogglePlugin={handlePluginToggle}
        />
      )}

      {showSearch && (
        <SearchModal
          notes={notes}
          onClose={() => setShowSearch(false)}
          onSelectNote={(note) => {
            setSelectedNote(note);
            setShowSearch(false);
          }}
        />
      )}
    </div>
  );
}
