import { useState, useEffect, useCallback } from 'react';
import { backend } from './api';
import type { Note, Folder, AppSettings, SearchQuery, Plugin } from './api/backend';
import { DEFAULT_TEMPLATES } from './api/backend';
import { Sidebar, type SidebarNavItem } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { ToastContainer } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { GraphView } from './components/GraphView';
import { GitPanel } from './components/GitPanel';
import { PublishPanel } from './components/PublishPanel';
import { SearchModal } from './components/SearchModal';
import { PluginManagerModal } from './components/PluginManagerModal';
import { RightPanel } from './components/RightPanel';
import { MobileTabbar, type TabItem } from './components/MobileTabbar';
import { StrokeIcon } from './icons';
import './App.css';

interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

/** 应用导航(桌面左侧栏 = 移动端底部 Tab 栏的并集,商枢注册表思路) */
const NAV_ITEMS: SidebarNavItem[] = [
  { id: 'notes', icon: 'notes', label: '笔记' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'graph', icon: 'graph', label: '图谱' },
  { id: 'git', icon: 'git', label: 'Git' },
  { id: 'publish', icon: 'publish', label: '发布' },
  { id: 'plugins', icon: 'plugin', label: '插件' },
];

/** 移动端底部 Tab(手机 <768px;搜索/设置为模态入口) */
const MOBILE_TABS: TabItem[] = [
  { id: 'notes', icon: 'notes', label: '笔记' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'graph', icon: 'graph', label: '图谱' },
  { id: 'settings', icon: 'settings', label: '设置' },
];

/** 右侧栏标签页 */
type RightTab = 'outline' | 'properties' | 'pomodoro';

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
  /** 当前主区视图:notes(编辑器)/ graph / git / publish */
  const [activeNav, setActiveNav] = useState<string>('notes');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  /** 右侧大纲栏(默认折叠,减少视觉噪音;由编辑器大纲按钮/番茄钟打开) */
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<RightTab>('outline');
  /** 手机端视图:列表 ⇄ 编辑器单栏切换 */
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  /** 是否处于手机视口(<768px):mobile-view-* 类只在手机视口下挂载 */
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
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

  // 手机断点监听:同步 isMobile 状态;离开手机视口时复位单栏视图
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileView('list');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 注入用户自定义 CSS
  useEffect(() => {
    const styleId = 'biji-custom-css';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (settings?.custom_css) {
      if (!el) {
        el = document.createElement('style');
        el.id = styleId;
        document.head.appendChild(el);
      }
      el.textContent = settings.custom_css;
    } else {
      el?.remove();
    }
    return () => el?.remove();
  }, [settings?.custom_css]);

  /** 导航点击统一入口:桌面侧栏 + 移动底栏共用 */
  const handleNavClick = (id: string) => {
    if (id === 'notes') {
      setActiveNav('notes');
      setMobileView('list');
    } else if (id === 'search') {
      setShowSearch(true);
    } else if (id === 'graph' || id === 'git' || id === 'publish') {
      setActiveNav(id);
      setMobileView('editor');
    } else if (id === 'plugins') {
      setShowPluginManager(true);
    } else if (id === 'settings') {
      setShowSettings(true);
    }
  };

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
    setActiveNav('notes');
    setMobileView('editor');
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
    if (activeNav === 'graph') setGraphKey(k => k + 1);
    showToast('笔记已保存');
  };

  /** 编辑器标题实时变更:同步列表与当前选中笔记(新建笔记标题立即生效) */
  const handleTitleChange = useCallback((title: string) => {
    // 先取当前选中笔记,再一次性更新两个状态(避免在 updater 里嵌套 setState)
    const current = selectedNote;
    if (!current) return;
    const updated = { ...current, title };
    setNotes(prevNotes => prevNotes.map(n => n.id === updated.id ? updated : n));
    setSelectedNote(updated);
  }, [selectedNote]);

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
      setActiveNav('notes');
      setMobileView('editor');
    } else {
      showToast(`未找到笔记: ${noteTitle}`, 'info');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC:关闭最上层的弹窗(搜索/设置/插件管理),避免 overlay 残留
      if (e.key === 'Escape') {
        if (showSearch || showSettings || showPluginManager) {
          e.preventDefault();
          setShowSearch(false);
          setShowSettings(false);
          setShowPluginManager(false);
        }
        return;
      }
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
        [s.toggle_graph]: () => { e.preventDefault(); handleNavClick(activeNav === 'graph' ? 'notes' : 'graph'); },
        [s.toggle_left_sidebar]: () => { e.preventDefault(); setLeftSidebarCollapsed(prev => !prev); },
        [s.toggle_right_sidebar]: () => { e.preventDefault(); setRightPanelOpen(prev => !prev); },
      };
      shortcuts[pressed]?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, handleNewNote, handleNewFolder, activeNav, showSearch, showSettings, showPluginManager]);

  if (isLoading) return <div className="loading">加载中...</div>;

  const pomodoroEnabled = plugins.some(p => p.id === 'pomodoro-plugin' && p.enabled);

  return (
    <div
      className={`app-container ${rightPanelOpen ? 'with-right-panel' : ''} ${isMobile ? `mobile-view-${mobileView}` : ''}`}
    >
      {/* 左侧导航栏(桌面/平板;手机隐藏) */}
      <div data-panel="left-sidebar">
        <Sidebar
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onOpenSettings={() => setShowSettings(true)}
          onNewNote={handleNewNote}
          onNewFolder={handleNewFolder}
          navItems={NAV_ITEMS}
          activeNav={activeNav}
          onNavClick={handleNavClick}
          collapsed={leftSidebarCollapsed}
          onToggleCollapse={() => setLeftSidebarCollapsed(prev => !prev)}
        />
      </div>

      {/* 笔记列表(桌面/平板并排;手机单栏切换) */}
      <div data-panel="note-list">
        <NoteList
          notes={selectedFolderId ? notes.filter(n => n.folder_id === selectedFolderId) : notes}
          selectedNoteId={selectedNote?.id}
          onSelectNote={(note) => { setSelectedNote(note); setMobileView('editor'); }}
          onNewNote={handleNewNote}
          onSearch={handleSearch}
        />
      </div>

      {/* 主区:编辑器 / 图谱 / Git / 发布 */}
      <div className="main-content" data-panel="main-content">
        <button
          className="mobile-back-btn"
          onClick={() => setMobileView('list')}
          title="返回笔记列表"
        >
          <StrokeIcon name="back" size={20} />
        </button>
        <div className="main-content-inner" data-panel={activeNav === 'graph' ? 'graph' : activeNav === 'git' ? 'git' : activeNav === 'publish' ? 'publish' : 'editor'}>
          {activeNav === 'graph' ? (
            <GraphView
              key={graphKey}
              onSelectNote={(noteId) => {
                const note = notes.find(n => n.id === noteId);
                if (note) { setSelectedNote(note); setActiveNav('notes'); setMobileView('editor'); }
              }}
              currentNoteId={selectedNote?.id}
              onRefresh={() => setGraphKey(k => k + 1)}
            />
          ) : activeNav === 'git' ? (
            <GitPanel onClose={() => handleNavClick('notes')} />
          ) : activeNav === 'publish' ? (
            <PublishPanel onClose={() => handleNavClick('notes')} />
          ) : (
            <Editor
              note={selectedNote}
              onSave={handleSaveNote}
              onDelete={handleDeleteNote}
              settings={settings}
              syncEnabled={pomodoroEnabled}
              onLinkClick={handleLinkClick}
              onTitleChange={handleTitleChange}
              onToggleOutline={() => {
                setRightPanelOpen(prev => !prev);
                if (rightPanelTab !== 'outline') setRightPanelTab('outline');
              }}
            />
          )}
        </div>
        <StatusBar syncEnabled={plugins.some(p => p.id === 'sync-plugin' && p.enabled)} />
      </div>

      {/* 右侧大纲栏:默认折叠,仅在编辑器视图可开 */}
      {selectedNote && activeNav === 'notes' && rightPanelOpen && (
        <div data-panel="right-sidebar">
          <RightPanel
            key={rightPanelTab}
            content={selectedNote?.content || ''}
            defaultTab={rightPanelTab}
            pomodoroEnabled={pomodoroEnabled}
            onHeadingClick={(heading, level) => {}}
            onToggle={() => setRightPanelOpen(false)}
            onPropertiesClick={() => showToast('属性面板', 'info')}
          />
        </div>
      )}

      {/* 移动端底部 Tab 栏(<768px 显示) */}
      <MobileTabbar
        items={MOBILE_TABS}
        activeId={activeNav}
        onTabClick={handleNavClick}
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
          onSelectNote={(note) => { setSelectedNote(note); setShowSearch(false); setMobileView('editor'); }}
        />
      )}

      {showPluginManager && (
        <PluginManagerModal onClose={() => setShowPluginManager(false)} onPluginChange={setPlugins} />
      )}
    </div>
  );
}
