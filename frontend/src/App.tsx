import { useState, useEffect, useCallback } from 'react';
import { backend } from './api';
import type { Note, Folder, AppSettings, SearchQuery, Plugin } from './api/backend';
import { DEFAULT_TEMPLATES } from './api/backend';
import { Sidebar, type SidebarButton } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { Toolbar, type ToolbarButton } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { ToastContainer } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { GraphView } from './components/GraphView';
import { GitPanel } from './components/GitPanel';
import { PublishPanel } from './components/PublishPanel';
import { SearchModal } from './components/SearchModal';
import { PluginManagerModal } from './components/PluginManagerModal';
import { PomodoroTimer } from './components/PomodoroTimer';
import { RightPanel } from './components/RightPanel';
import './App.css';

interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
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
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [graphKey, setGraphKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const [sidebarButtons, setSidebarButtons] = useState<SidebarButton[]>([
    { id: 'files', icon: 'files', label: '文件', visible: true },
    { id: 'search', icon: 'search', label: '搜索', visible: true },
    { id: 'tags', icon: 'tags', label: '标签', visible: false },
  ]);

  const [toolbarButtons, setToolbarButtons] = useState<ToolbarButton[]>([
    { id: 'graph', icon: 'graph', label: '图谱' },
    { id: 'git', icon: 'git', label: 'Git' },
    { id: 'publish', icon: 'publish', label: '发布' },
    { id: 'plugins', icon: 'plugin', label: '插件' },
  ]);

  const loadData = useCallback(async () => {
    try {
      const [notesData, foldersData, settingsData, pluginsData] = await Promise.all([
        backend.getNotes(),
        backend.getFolders(),
        backend.getSettings(),
        backend.getPlugins(),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setSettings(settingsData);
      setPlugins(pluginsData);
      applyTheme(settingsData.theme);
    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('加载数据失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const applyTheme = (theme: string) => {
    let isDark = false;
    if (theme === 'dark') isDark = true;
    else if (theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  };

  useEffect(() => { loadData(); }, [loadData]);

  const handleNewNote = async () => {
    const templateId = settings?.template || 'blank';
    const template = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    let content = template?.content || '';
    if (templateId === 'daily') {
      content = content.replace('{{date}}', new Date().toLocaleDateString('zh-CN'));
    }
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '无标题',
      content,
      created_at: Date.now(),
      updated_at: Date.now(),
      tags: [],
      folder_id: selectedFolderId,
      is_encrypted: false,
      sync_status: 'pending',
    };
    await backend.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);
    showToast('已创建新笔记');
  };

  const handleNewFolder = () => {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name: '新建文件夹',
      parent_id: selectedFolderId,
      created_at: Date.now(),
    };
    backend.saveFolder(newFolder);
    setFolders(prev => [...prev, newFolder]);
    showToast('已创建新文件夹');
  };

  const handleSaveNote = async (note: Note) => {
    const updated = { ...note, updated_at: Date.now(), sync_status: 'pending' as const };
    await backend.saveNote(updated);
    setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
    setSelectedNote(updated);
    if (showGraph) setGraphKey(k => k + 1);
    showToast('笔记已保存');
  };

  const handleDeleteNote = async (id: string) => {
    await backend.deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
    showToast('笔记已删除');
  };

  const handleSearch = async (query: SearchQuery) => {
    const results = await backend.searchNotes(query);
    setNotes(results);
    showToast(`找到 ${results.length} 条结果`);
  };

  const handleSettingsChange = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    await backend.setSettings(updated);
    setSettings(updated);
    if (patch.theme) applyTheme(patch.theme as string);
  };

  const handleTogglePlugin = async (id: string, enabled: boolean) => {
    await backend.togglePlugin(id, enabled);
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
  };

  const handleLinkClick = (noteTitle: string) => {
    const linked = notes.find(n => n.title === noteTitle);
    if (linked) {
      setSelectedNote(linked);
      setShowGraph(false);
    } else {
      showToast(`未找到笔记: ${noteTitle}`, 'info');
    }
  };

  const handleToggleSidebarButton = (buttonId: string) => {
    if (buttonId === 'search') setShowSearch(true);
    else if (buttonId === 'graph') { setShowGraph(!showGraph); setShowGitPanel(false); setShowPublishPanel(false); }
    else if (buttonId === 'git') { setShowGitPanel(!showGitPanel); setShowGraph(false); setShowPublishPanel(false); }
    else if (buttonId === 'publish') { setShowPublishPanel(!showPublishPanel); setShowGraph(false); setShowGitPanel(false); }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings?.shortcuts) return;
      const s = settings.shortcuts;
      const key: string[] = [];
      if (e.ctrlKey) key.push('Ctrl');
      if (e.shiftKey) key.push('Shift');
      if (e.altKey) key.push('Alt');
      key.push(e.key.toUpperCase());
      const pressed = key.join('+');

      const shortcuts: Record<string, () => void> = {
        [s.open_settings]: () => setShowSettings(true),
        [s.new_note]: () => { e.preventDefault(); handleNewNote(); },
        [s.new_folder]: () => { e.preventDefault(); handleNewFolder(); },
        [s.search]: () => { e.preventDefault(); setShowSearch(true); },
        [s.toggle_graph]: () => { e.preventDefault(); setShowGraph(prev => !prev); },
        [s.toggle_left_sidebar]: () => { e.preventDefault(); setLeftSidebarCollapsed(prev => !prev); },
        [s.toggle_right_sidebar]: () => { e.preventDefault(); setRightSidebarCollapsed(prev => !prev); },
      };
      shortcuts[pressed]?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, handleNewNote, handleNewFolder]);

  if (isLoading) return <div className="loading">加载中...</div>;

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
        onButtonsChange={setSidebarButtons}
        onToggleButton={handleToggleSidebarButton}
        collapsed={leftSidebarCollapsed}
        onToggleCollapse={() => setLeftSidebarCollapsed(prev => !prev)}
      />

      <NoteList
        notes={selectedFolderId ? notes.filter(n => n.folder_id === selectedFolderId) : notes}
        selectedNoteId={selectedNote?.id}
        onSelectNote={setSelectedNote}
        onNewNote={handleNewNote}
        onSearch={handleSearch}
      />

      <div className="main-content">
        <div className="main-content-inner">
          {showGraph ? (
            <GraphView
              key={graphKey}
              onSelectNote={(noteId) => {
                const note = notes.find(n => n.id === noteId);
                if (note) { setSelectedNote(note); setShowGraph(false); }
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
              syncEnabled={plugins.some(p => p.id === 'sync-plugin' && p.enabled)}
              onLinkClick={handleLinkClick}
            />
          )}
        </div>
        <StatusBar syncEnabled={plugins.some(p => p.id === 'sync-plugin' && p.enabled)} />
      </div>

      {selectedNote && !showGraph && !showGitPanel && !showPublishPanel && (
        <RightPanel
          content={selectedNote?.content || ''}
          onHeadingClick={(heading, level) => {}}
          onToggle={() => setRightSidebarCollapsed(true)}
          onPropertiesClick={() => showToast('属性面板', 'info')}
        />
      )}

      <Toolbar
        buttons={toolbarButtons}
        onButtonOrderChange={setToolbarButtons}
        onPluginClick={(id) => { if (id === 'plugins') setShowPluginManager(true); }}
        onBuiltInPluginClick={(pluginId) => {
          if (pluginId === 'pomodoro-plugin') {
            setRightSidebarCollapsed(false);
            showToast('番茄钟已打开', 'info');
          } else showToast(`插件 ${pluginId}`);
        }}
        onGraphClick={() => handleToggleSidebarButton('graph')}
        onGitClick={() => handleToggleSidebarButton('git')}
        onPublishClick={() => handleToggleSidebarButton('publish')}
        isGraphActive={showGraph}
        isGitActive={showGitPanel}
        isPublishActive={showPublishPanel}
        collapsed={toolbarCollapsed}
        onToggleCollapse={() => setToolbarCollapsed(prev => !prev)}
        builtInPlugins={plugins.filter(p => p.built_in)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          plugins={plugins}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsChange}
          onTogglePlugin={handleTogglePlugin}
        />
      )}

      {showSearch && (
        <SearchModal
          notes={notes}
          onClose={() => setShowSearch(false)}
          onSelectNote={(note) => { setSelectedNote(note); setShowSearch(false); }}
        />
      )}

      {showPluginManager && (
        <PluginManagerModal onClose={() => setShowPluginManager(false)} onPluginChange={setPlugins} />
      )}
    </div>
  );
}
