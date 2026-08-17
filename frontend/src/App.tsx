import { useState, useEffect, useCallback } from 'react';
import { backend } from './api';
import type { Note, Folder, AppSettings, Plugin, NoteBlock, TagCount, NoteTemplate, TrashBlock } from './api/backend';
import { DEFAULT_TEMPLATES } from './api/backend';
import { Sidebar, type SidebarNavItem } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { ToastContainer } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { GraphView } from './components/GraphView';
import { CalendarView } from './components/CalendarView';
import { GitPanel } from './components/GitPanel';
import { PublishPanel } from './components/PublishPanel';
import { SearchModal } from './components/SearchModal';
import { PluginManagerModal } from './components/PluginManagerModal';
import { RightPanel } from './components/RightPanel';
import { TrashView } from './components/TrashView';
import { NewNoteModal } from './components/NewNoteModal';
import { MobileTabbar, type TabItem } from './components/MobileTabbar';
import { StrokeIcon } from './icons';
import './App.css';

interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

/** [M3.5b 导出] 触发浏览器下载一个文本文件 */
function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 文件名安全化(去掉路径分隔符/非法字符) */
function sanitizeName(name: string): string {
  return (name || '未命名').replace(/[\\/:*?"<>|]/g, '_');
}

/** 应用导航(桌面左侧栏 = 移动端底部 Tab 栏的并集,商枢注册表思路) */
const NAV_ITEMS: SidebarNavItem[] = [
  { id: 'notes', icon: 'notes', label: '笔记' },
  { id: 'calendar', icon: 'calendar', label: '日历' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'graph', icon: 'graph', label: '图谱' },
  { id: 'git', icon: 'git', label: 'Git' },
  { id: 'publish', icon: 'publish', label: '发布' },
  { id: 'plugins', icon: 'plugin', label: '插件' },
  { id: 'trash', icon: 'trash', label: '回收站' },
];

/** 移动端底部 Tab(手机 <768px;搜索/设置为模态入口) */
const MOBILE_TABS: TabItem[] = [
  { id: 'notes', icon: 'notes', label: '笔记' },
  { id: 'calendar', icon: 'calendar', label: '日历' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'graph', icon: 'graph', label: '图谱' },
  { id: 'settings', icon: 'settings', label: '设置' },
];

/** 右侧栏标签页 */
type RightTab = 'outline' | 'properties' | 'pomodoro' | 'backlinks';

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
  /** M2:当前选中笔记的块序列(切换笔记/保存后刷新,供编辑器块时间戳展示) */
  const [noteBlocks, setNoteBlocks] = useState<NoteBlock[]>([]);
  /** 检索双模式(title/content),SearchModal 切换 */
  const [searchMode, setSearchMode] = useState<'title' | 'content'>('title');
  /** [M3.5a 标签树] 全部标签(侧栏标签区) */
  const [tags, setTags] = useState<TagCount[]>([]);
  /** [M3.5a 标签树] 已选标签:过滤 NoteList */
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  /** [M3.5b 笔记模板] 模板列表(内置 + 自定义) */
  const [templates, setTemplates] = useState<NoteTemplate[]>(DEFAULT_TEMPLATES as NoteTemplate[]);
  /** [M3.5b 笔记模板] 是否显示「新建笔记选模板」弹窗 */
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  /** [M3.5b 回收站] 回收站中的笔记与块 */
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [trashBlocks, setTrashBlocks] = useState<TrashBlock[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [notesData, foldersData, settingsData, pluginsData, tagsData, templatesData] = await Promise.all([
        backend.getNotes(),
        backend.getFolders(),
        backend.getSettings(),
        backend.getPlugins(),
        backend.getTags().catch(() => [] as TagCount[]),
        backend.getTemplates().catch(() => DEFAULT_TEMPLATES as NoteTemplate[]),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setSettings(settingsData);
      setPlugins(pluginsData);
      setTags(tagsData);
      if (templatesData && templatesData.length) setTemplates(templatesData);
      applyTheme(settingsData.theme);
    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('加载数据失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  /** [M3.5b 回收站] 刷新回收站列表 */
  const loadTrash = useCallback(async () => {
    try {
      const [tn, tb] = await Promise.all([
        backend.getTrashNotes().catch(() => [] as Note[]),
        backend.getTrashBlocks().catch(() => [] as TrashBlock[]),
      ]);
      setTrashNotes(tn);
      setTrashBlocks(tb);
    } catch { /* 忽略 */ }
  }, []);

  const applyTheme = (theme: string) => {
    let isDark = false;
    if (theme === 'dark') isDark = true;
    else if (theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  };

  useEffect(() => { loadData(); }, [loadData]);

  // M2:切换笔记时加载其块序列(供编辑器块时间戳展示);无选中笔记则清空
  useEffect(() => {
    let cancelled = false;
    if (selectedNote) {
      backend.getNoteBlocks(selectedNote.id)
        .then(blocks => { if (!cancelled) setNoteBlocks(blocks); })
        .catch(() => { if (!cancelled) setNoteBlocks([]); });
    } else {
      setNoteBlocks([]);
    }
    return () => { cancelled = true; };
  }, [selectedNote?.id]);

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

  // [M3.5b 排版] 字号/字体设置 → 全局 CSS 变量(不含自定义 CSS,避免与其冲突)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-font-size', settings?.font_size ? `${settings.font_size}px` : '15px');
    if (settings?.font_family && settings.font_family !== 'sans-serif') {
      root.style.setProperty('--app-font-family', settings.font_family);
    } else {
      root.style.removeProperty('--app-font-family');
    }
  }, [settings?.font_size, settings?.font_family]);

  // 更新系统断点暗色跟随(theme=system 时随系统切换)
  useEffect(() => {
    if (settings?.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings?.theme]);

  /** 导航点击统一入口:桌面侧栏 + 移动底栏共用 */
  const handleNavClick = (id: string) => {
    if (id === 'notes') {
      setActiveNav('notes');
      setMobileView('list');
    } else if (id === 'search') {
      setShowSearch(true);
    } else if (id === 'calendar') {
      setActiveNav('calendar');
      setMobileView('editor');
    } else if (id === 'graph' || id === 'git' || id === 'publish') {
      setActiveNav(id);
      setMobileView('editor');
    } else if (id === 'trash') {
      setActiveNav('trash');
      setMobileView('editor');
      loadTrash();
    } else if (id === 'plugins') {
      setShowPluginManager(true);
    } else if (id === 'settings') {
      setShowSettings(true);
    }
  };

  /** [M3.5a] 日历/反向链接的跳转入口:打开目标笔记 */
  const jumpToNote = ({ id, title }: { id: string; title: string }) => {
    const target = notes.find(n => n.id === id);
    if (target) {
      setSelectedNote(target);
      setActiveNav('notes');
      setMobileView('editor');
    } else {
      showToast(`未找到笔记: ${title}`, 'info');
    }
  };

  const handleNewNote = async () => {
    // [M3.5b] 打开模板选择弹窗(空白/日记/会议/读书/自定义)
    setShowNewNoteModal(true);
  };

  /** [M3.5b] 从所选模板新建笔记(替换 {{date}} 为当天日期;自定义模板先落库) */
  const createNoteFromTemplate = async (template: NoteTemplate) => {
    setShowNewNoteModal(false);
    let content = template.content || '';
    let templateId = template.id;
    if (templateId === '__custom__') {
      // 自定义模板:先创建保存,再以其内容新建
      try { templateId = (await backend.createTemplate(template.name, template.content)).id; }
      catch { /* 若后端不支持则退回直接用内容 */ }
      setTemplates(prev => [...prev, { ...template, id: templateId }]);
    }
    content = content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString('zh-CN'));
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
    showToast(`已用「${template.name}」模板创建笔记`);
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
    // M2:保存时后端已拆块入库,刷新块序列让时间戳展示跟上
    try {
      const blocks = await backend.getNoteBlocks(updated.id);
      setNoteBlocks(blocks);
    } catch { /* 块 API 未就绪时静默降级 */ }
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
    showToast('笔记已删除(可到回收站恢复)');
  };

  // ==================== [M3.5b 回收站] ====================

  const handleRestoreNote = async (id: string) => {
    await backend.restoreNote(id);
    await loadTrash();
    // 若恢复的是当前正看的笔记,同步回列表
    const restored = notes.find(n => n.id === id) ?? trashNotes.find(n => n.id === id);
    if (restored) setNotes(prev => prev.some(n => n.id === id) ? prev : [restored, ...prev]);
    showToast('笔记已恢复');
  };

  const handlePermanentDeleteNote = async (id: string) => {
    await backend.permanentDeleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    await loadTrash();
    showToast('笔记已彻底删除', 'info');
  };

  const handleRestoreBlock = async (id: string) => {
    await backend.restoreBlock(id);
    await loadTrash();
    // 恢复块后刷新当前选中笔记的块序列
    if (selectedNote) {
      try { setNoteBlocks(await backend.getNoteBlocks(selectedNote.id)); } catch { /* 忽略 */ }
    }
    showToast('内容片段已恢复到原文');
  };

  const handlePermanentDeleteBlock = async (id: string) => {
    await backend.permanentDeleteBlock(id);
    await loadTrash();
    showToast('内容片段已彻底删除', 'info');
  };

  const handleEmptyTrash = async () => {
    await backend.emptyTrash();
    setTrashNotes([]);
    setTrashBlocks([]);
    showToast('回收站已清空', 'info');
  };

  // ==================== [M3.5b 导出] ====================

  const handleExportMarkdown = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const md = await backend.exportNoteMarkdown(noteId);
    downloadFile(md, `biji-${sanitizeName(note.title)}.md`, 'text/markdown');
    showToast('已导出 .md 文件');
  };

  const handleExportHtml = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const html = await backend.exportNoteHtml(noteId);
    downloadFile(html, `biji-${sanitizeName(note.title)}.html`, 'text/html');
    showToast('已导出 HTML(可用浏览器打印为 PDF)');
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
      // ESC:关闭最上层的弹窗(搜索/设置/插件管理/新建模板),避免 overlay 残留
      if (e.key === 'Escape') {
        if (showSearch || showSettings || showPluginManager || showNewNoteModal) {
          e.preventDefault();
          setShowSearch(false);
          setShowSettings(false);
          setShowPluginManager(false);
          setShowNewNoteModal(false);
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
  }, [settings, handleNewNote, handleNewFolder, activeNav, showSearch, showSettings, showPluginManager, showNewNoteModal]);

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
          onSelectFolder={(id) => { setSelectedFolderId(id); setSelectedTag(null); }}
          onOpenSettings={() => setShowSettings(true)}
          onNewNote={handleNewNote}
          onNewFolder={handleNewFolder}
          navItems={NAV_ITEMS}
          activeNav={activeNav}
          onNavClick={handleNavClick}
          collapsed={leftSidebarCollapsed}
          onToggleCollapse={() => setLeftSidebarCollapsed(prev => !prev)}
          tags={tags}
          notes={notes}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
        />
      </div>

      {/* 笔记列表(桌面/平板并排;手机单栏切换)——M3 嵌套可折叠文件夹树 */}
      <div data-panel="note-list">
        <NoteList
          notes={notes}
          folders={folders}
          selectedNoteId={selectedNote?.id}
          selectedFolderId={selectedFolderId}
          onSelectNote={(note) => { setSelectedNote(note); setMobileView('editor'); }}
          onSelectFolder={(id) => { setSelectedFolderId(id); setSelectedTag(null); }}
          onNewNote={handleNewNote}
          selectedTag={selectedTag}
          onClearTag={() => setSelectedTag(null)}
          onDeleteNote={handleDeleteNote}
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
        <div className="main-content-inner" data-panel={activeNav === 'trash' ? 'trash' : activeNav === 'graph' ? 'graph' : activeNav === 'calendar' ? 'calendar' : activeNav === 'git' ? 'git' : activeNav === 'publish' ? 'publish' : 'editor'}>
          {activeNav === 'trash' ? (
            <TrashView
              trashNotes={trashNotes}
              trashBlocks={trashBlocks}
              onRestoreNote={handleRestoreNote}
              onDeleteNoteForever={handlePermanentDeleteNote}
              onRestoreBlock={handleRestoreBlock}
              onDeleteBlockForever={handlePermanentDeleteBlock}
              onEmptyTrash={() => handleEmptyTrash()}
              onClose={() => handleNavClick('notes')}
              onOpenNote={(noteId) => {
                const note = notes.find(n => n.id === noteId) ?? trashNotes.find(n => n.id === noteId);
                if (note && !note.deleted_at) { setSelectedNote(note); setActiveNav('notes'); setMobileView('editor'); }
                else if (note) showToast('该笔记在回收站中,请先恢复', 'info');
              }}
            />
          ) : activeNav === 'graph' ? (
            <GraphView
              key={graphKey}
              onSelectNote={(noteId) => {
                const note = notes.find(n => n.id === noteId);
                if (note) { setSelectedNote(note); setActiveNav('notes'); setMobileView('editor'); }
              }}
              currentNoteId={selectedNote?.id}
              onRefresh={() => setGraphKey(k => k + 1)}
            />
          ) : activeNav === 'calendar' ? (
            <CalendarView onSelectNote={jumpToNote} />
          ) : activeNav === 'git' ? (
            <GitPanel onClose={() => handleNavClick('notes')} />
          ) : activeNav === 'publish' ? (
            <PublishPanel onClose={() => handleNavClick('notes')} />
          ) : (
            <Editor
              note={selectedNote}
              folders={folders}
              onSelectFolder={setSelectedFolderId}
              onSave={handleSaveNote}
              onDelete={handleDeleteNote}
              settings={settings}
              syncEnabled={pomodoroEnabled}
              onLinkClick={handleLinkClick}
              onTitleChange={handleTitleChange}
              noteBlocks={noteBlocks}
              onToggleOutline={() => {
                setRightPanelOpen(prev => !prev);
                if (rightPanelTab !== 'outline') setRightPanelTab('outline');
              }}
              onOpenBacklinks={() => {
                setRightPanelOpen(true);
                setRightPanelTab('backlinks');
              }}
              onExportMarkdown={handleExportMarkdown}
              onExportHtml={handleExportHtml}
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
            noteId={selectedNote?.id || null}
            onSelectNote={jumpToNote}
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
          mode={searchMode}
          onModeChange={(m) => { setSearchMode(m); }}
          onClose={() => setShowSearch(false)}
          onSelectNote={(note) => { setSelectedNote(note); setShowSearch(false); setMobileView('editor'); }}
        />
      )}

      {showPluginManager && (
        <PluginManagerModal onClose={() => setShowPluginManager(false)} onPluginChange={setPlugins} />
      )}

      {showNewNoteModal && (
        <NewNoteModal
          templates={templates}
          onSelect={createNoteFromTemplate}
          onClose={() => setShowNewNoteModal(false)}
        />
      )}
    </div>
  );
}
