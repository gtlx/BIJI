import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { SearchModal } from './components/SearchModal';
import { PluginManagerModal } from './components/PluginManagerModal';
import { OutlinePane } from './components/OutlinePane';
import { BacklinksPane } from './components/BacklinksPane';
import { PropertiesPane } from './components/PropertiesPane';
import { TrashView } from './components/TrashView';
import { NewNoteModal } from './components/NewNoteModal';
import { MobileTabbar, type TabItem } from './components/MobileTabbar';
import { CommandPalette, type CommandAction } from './components/CommandPalette';
import { TemplateInsertModal } from './components/TemplateInsertModal';
import { PaneWorkspace } from './components/pane/PaneWorkspace';
import { NoteTabs, type NoteTabPosition } from './components/NoteTabs';
import { TagsPane } from './components/TagsPane';
import { PomodoroTimer } from './components/PomodoroTimer';
import { loadLayout, saveLayout } from './components/pane/layoutStore';
import type { PaneId, PaneLayout } from './components/pane/types';
import { PANE_META, defaultLayout } from './components/pane/types';
import { StrokeIcon } from './icons';
import { KanbanPane } from './components/KanbanPane';
import { getFrontendPlugin, getViewPlugin, getNavPlugins, subscribeFrontendPlugins, isPaneAddable } from './plugins/registry';
import { withKanbanStatus } from './utils/frontmatter';
import {
  type FolderPresetConfig,
  PRESET_LABELS,
  findTopLevelFolder,
  getPresetForFolder,
  resolvePreset,
} from './utils/folderPresets';
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

/** 核心导航项(硬编码,不插件化):笔记/搜索/图谱/Git。
 *  (日历已从核心导航移除 → 纯右 dock 面板,靠「添加面板」/命令面板打开,见 registry。番茄钟同理。) */
const CORE_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'notes', icon: 'notes', label: '笔记' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'graph', icon: 'graph', label: '图谱' },
  { id: 'git', icon: 'git', label: 'Git' },
];

/** 移动端底部 Tab(手机 <768px;搜索/设置为模态入口) */
const MOBILE_TABS: TabItem[] = [
  { id: 'notes', icon: 'notes', label: '笔记' },
  { id: 'calendar', icon: 'calendar', label: '日历' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'graph', icon: 'graph', label: '图谱' },
  { id: 'settings', icon: 'settings', label: '设置' },
];

/** [拖拽调宽] 左侧栏宽记忆(localStorage);resizer 拖动 clamp 上下限 */
const SIDEBAR_WIDTH_KEY = 'biji.sidebarWidth';
const SIDEBAR_WIDTH_MIN = 160;
const SIDEBAR_WIDTH_MAX = 420;

/** 读本地存储整数值;无该 key(首次)或非法回退默认值,越界 clamp */
function readStoredInt(key: string, def: number, min: number, max: number): number {
  try {
    // 注意:getItem 返回 null 表示「无此 key」,不能用 Number(null)=0(否则首次加载被误 clamp 到 min)
    const raw = localStorage.getItem(key);
    if (raw === null) return def;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;
  } catch { return def; }
}

/** [渐进多标签] 打开历史标签的本地存储键 */
const OPEN_TABS_KEY = 'biji.openNoteTabs';
const NOTE_TAB_POS_KEY = 'biji.noteTabPosition';

/** 读打开笔记历史(localStorage;结构 = 笔记 id 数组 + 活动 id,便于将来升级真多标签) */
function readOpenTabs(): { ids: string[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY);
    if (!raw) return { ids: [], activeId: null };
    const p = JSON.parse(raw);
    const ids = Array.isArray(p?.ids) ? p.ids.filter((x: unknown) => typeof x === 'string') : [];
    const activeId = typeof p?.activeId === 'string' && ids.includes(p.activeId) ? p.activeId : null;
    return { ids, activeId };
  } catch { return { ids: [], activeId: null }; }
}

/** 读标签排列偏好(默认顶部横排) */
function readTabPosition(): NoteTabPosition {
  try { return localStorage.getItem(NOTE_TAB_POS_KEY) === 'left' ? 'left' : 'top'; } catch { return 'top'; }
}

/** [顶层目录预设] 顶层目录 → 预设映射的本地存储键 */
const FOLDER_PRESETS_KEY = 'biji.folderPresets';

/** 读「顶层目录预设」配置(JSON 数组;非法/异常回退空) */
function readFolderPresets(): FolderPresetConfig[] {
  try {
    const raw = localStorage.getItem(FOLDER_PRESETS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter((x: unknown) =>
      x && typeof (x as FolderPresetConfig).folderId === 'string' &&
      typeof (x as FolderPresetConfig).type === 'string',
    ) as FolderPresetConfig[];
  } catch { return []; }
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
  /** 当前主区视图:notes(编辑器)/ graph / git / publish */
  const [activeNav, setActiveNav] = useState<string>('notes');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  /** [拖拽调宽] 右侧 dock 整体展开/收起(由 Ctrl+] toggle_right_sidebar 控制) */
  const [rightDockOpen, setRightDockOpen] = useState(true);
  /**
   * [拖拽调宽] 左侧栏宽(存 localStorage;拖动 app-container 的 sidebar-resizer 更新 --sidebar-width)。
   * 桌面默认 224px,--sidebar-width 即 app-container 网格首列轨道宽度。
   */
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readStoredInt(SIDEBAR_WIDTH_KEY, 224, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX),
  );
  const sidebarResizerRef = useRef<HTMLDivElement>(null);

  /** 左侧栏宽 → 全局 CSS 变量(布局网格首列) */
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
  }, [sidebarWidth]);

  /** 左侧栏宽记忆落库(重启保持) */
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); } catch { /* 忽略 */ }
  }, [sidebarWidth]);

  /** 左栏拖拽调宽(resizer onPointerDown;window 监听随指针移动更新宽度) */
  const onSidebarResizerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* 无指针捕获环境忽略 */ }
    document.body.classList.add('biji-resizing');
    const onMove = (ev: PointerEvent) => {
      const next = startWidth + (ev.clientX - startX);
      setSidebarWidth(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, next))); 
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('biji-resizing');
      try { el.releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
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
  /** [顶层目录预设] 顶层目录 → 用途预设 映射(localStorage 记忆;单库内分类,不引入多 vault) */
  const [folderPresets, setFolderPresets] = useState<FolderPresetConfig[]>(() => readFolderPresets());
  /** [M3.5b 笔记模板] 是否显示「新建笔记选模板」弹窗 */
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  /** [M3.5b 回收站] 回收站中的笔记与块 */
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [trashBlocks, setTrashBlocks] = useState<TrashBlock[]>([]);

  /** [Pane] 工作区面板布局(localStorage 记忆) */
  const [paneLayout, setPaneLayout] = useState<PaneLayout>(() => loadLayout());
  /** [Pane] 是否正在渲染画布式工作区(notes/calendar/graph)→ true;git/publish/trash 全屏视图 → false */
  const [workspaceView, setWorkspaceView] = useState(true);
  /** [Pane] 编辑器命令 API(save / insertAtCursor),由 Editor 通过 onRegisterApi 注册 */
  const editorApiRef = useRef<{ save: () => void; insertAtCursor: (text: string) => void } | null>(null);
  /** [Pane] 命令面板开关 */
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  /** [Pane] 模板插入弹窗开关 */
  const [showTemplateInsert, setShowTemplateInsert] = useState(false);

  /** [渐进多标签] 本会话打开过的笔记历史(视图层记录,不参与数据模型;结构 = ids[] + activeId) */
  const [openTabs, setOpenTabs] = useState<{ ids: string[]; activeId: string | null }>(() => readOpenTabs());
  /** [渐进多标签] 标签排列偏好:顶部横排(默认) / 左侧竖排 */
  const [tabPosition, setTabPosition] = useState<NoteTabPosition>(() => readTabPosition());

  // [M8 补] 前端插件 enable 状态:订阅注册表变化,驱动导航重算
  const [fpRev, setFpRev] = useState(0);
  useEffect(() => {
    return subscribeFrontendPlugins(() => setFpRev(r => r + 1));
  }, []);

  /** [M8] 前端插件生成的导航项(随 enable 状态实时增减;发布/看板=view 全屏,日历=pane 不进导航)。
   *  de-dupe:剔除与核心导航重复的 id,避免右侧栏出现重复项。 */
  const coreNavIds = new Set<string>(CORE_NAV_ITEMS.map(i => i.id));
  const pluginNavItems = useMemo<SidebarNavItem[]>(
    () => getNavPlugins()
      .filter(p => !coreNavIds.has(p.id))
      .map(p => ({ id: p.id, icon: p.icon, label: p.label })),
    [fpRev],
  );

  /** 应用导航(桌面左侧栏 = 移动端底部 Tab 栏的并集,商枢注册表思路)——核心 + 插件 + 工具项 */
  const navItems = useMemo<SidebarNavItem[]>(
    () => [
      ...CORE_NAV_ITEMS,
      ...pluginNavItems,
      { id: 'plugins', icon: 'plugin', label: '插件' },
      { id: 'trash', icon: 'trash', label: '回收站' },
    ],
    [pluginNavItems],
  );

  // [Pane] 布局变化即落 localStorage(重启还原)
  useEffect(() => { saveLayout(paneLayout); }, [paneLayout]);

  // [Pane] 确保某面板打开(editor/files 归固定区;右侧面板加入右 dock 末尾行)
  const ensurePane = useCallback((id: PaneId) => {
    setPaneLayout(prev => {
      const hidden = prev.hidden.filter(p => p !== id);
      const meta = PANE_META[id];
      // 主区/左 dock:固定,不参与分栏
      if (meta.zone === 'main') {
        return { ...prev, main: id, hidden };
      }
      if (meta.zone === 'left') {
        const left = prev.left.includes(id) ? prev.left : [...prev.left, id];
        return { ...prev, left, hidden };
      }
      // 右 dock:已显示则不动,否则追加到末尾 row
      const already = prev.right.some(r => r.panes.includes(id));
      if (already) return { ...prev, hidden };
      const right = prev.right.map(r => ({ ...r, panes: [...r.panes] }));
      if (right.length > 0) {
        right[right.length - 1] = { ...right[right.length - 1]!, panes: [...right[right.length - 1]!.panes, id] };
      } else {
        right.push({ id: `row-${Date.now().toString(36)}`, panes: [id], active: 0 });
      }
      return { ...prev, right, hidden };
    });
  }, []);

  // [Pane] 关闭某面板(右 dock → 移到隐藏区;主/左固定区不可关)
  const closePane = useCallback((id: PaneId) => {
    setPaneLayout(prev => {
      const meta = PANE_META[id];
      // 主区/左 dock 固定,不允许关闭
      if (meta.zone === 'main' || meta.zone === 'left') {
        return prev;
      }
      const right = prev.right
        .map(r => ({ ...r, panes: r.panes.filter(p => p !== id) }))
        .filter(r => r.panes.length > 0);
      const hidden = prev.hidden.includes(id) ? prev.hidden : [...prev.hidden, id];
      return { ...prev, right, hidden };
    });
  }, []);

  // [Pane] 切换某面板开/关(仅右 dock 面板可切换;主/左固定)
  const togglePane = useCallback((id: PaneId) => {
    const meta = PANE_META[id];
    if (meta.zone === 'main' || meta.zone === 'left') return;
    const has = paneLayout.right.some(r => r.panes.includes(id));
    if (has) closePane(id); else ensurePane(id);
  }, [paneLayout, closePane, ensurePane]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ==================== [渐进多标签] 打开历史 ====================
  // 依赖 selectedNote 驱动核心:只要换到一篇新笔记(文件树/搜索/双链/日历/图谱等任意入口),
  // 都经全局 effect 记录到历史标签(去重,已在则移到末尾=激活)。不做任何数据模型改动。
  useEffect(() => {
    const id = selectedNote?.id;
    if (!id) return;
    setOpenTabs(prev => {
      const ids = prev.ids.filter(x => x !== id);
      return { ids: [...ids, id], activeId: id };
    });
  }, [selectedNote?.id]);

  // 笔记被删除/不存在时,清理对应历史标签(避免残留失效标签)
  useEffect(() => {
    setOpenTabs(prev => {
      const valid = prev.ids.filter(id => notes.some(n => n.id === id));
      if (valid.length === prev.ids.length) return prev;
      const activeId = prev.activeId !== null && valid.includes(prev.activeId)
        ? prev.activeId
        : (valid[valid.length - 1] ?? null);
      return { ids: valid, activeId };
    });
  }, [notes]);

  // 历史标签落 localStorage(重启保留;视图层记录,不接数据模型)
  useEffect(() => {
    try { localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(openTabs)); } catch { /* 忽略 */ }
  }, [openTabs]);
  // 排列偏好落 localStorage
  useEffect(() => {
    try { localStorage.setItem(NOTE_TAB_POS_KEY, tabPosition); } catch { /* 忽略 */ }
  }, [tabPosition]);

  // [顶层目录预设] 顶层目录 → 预设 映射落 localStorage(设置里即时生效)
  useEffect(() => {
    try { localStorage.setItem(FOLDER_PRESETS_KEY, JSON.stringify(folderPresets)); } catch { /* 忽略 */ }
  }, [folderPresets]);

  // 标签标题:从 notes 解析(未知名回退「未命名」)
  const tabTitles = useMemo(() => {
    const m: Record<string, string> = {};
    openTabs.ids.forEach(id => {
      const n = notes.find(x => x.id === id);
      if (n) m[id] = n.title || '未命名';
    });
    return m;
  }, [openTabs, notes]);

  /** [渐进多标签] 点某标签 → 跳到该篇笔记(设 selectedNote + 打开;已在则激活) */
  const handleSelectTab = useCallback((id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    setOpenTabs(prev => ({ ids: [...prev.ids.filter(x => x !== id), id], activeId: id }));
    setSelectedNote(note);
    setActiveNav('notes');
    setWorkspaceView(true);
    setMobileView('editor');
  }, [notes]);

  /** [渐进多标签] 关闭某标签:移除历史;若关的是活动标签 → 跳到相邻标签(优先右侧,否则左侧),无则空态 */
  const handleCloseTab = useCallback((id: string) => {
    const idx = openTabs.ids.indexOf(id);
    if (idx === -1) return;
    const ids = openTabs.ids.filter(x => x !== id);
    let activeId = openTabs.activeId;
    if (openTabs.activeId === id) {
      const neighbor = ids[Math.min(idx, ids.length - 1)] ?? ids[Math.max(idx - 1, 0)] ?? null;
      activeId = neighbor;
      if (neighbor) {
        const n = notes.find(x => x.id === neighbor);
        if (n) { setSelectedNote(n); setActiveNav('notes'); setWorkspaceView(true); setMobileView('editor'); }
      } else {
        setSelectedNote(null);
        setMobileView('list');
      }
    }
    setOpenTabs({ ids, activeId });
  }, [openTabs, notes]);

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
      ensurePane('editor');
      ensurePane('files');
      setWorkspaceView(true);
      setActiveNav('notes');
      setMobileView('list');
    } else if (id === 'search') {
      setShowSearch(true);
    } else if (id === 'calendar') {
      setActiveNav('calendar');
      setWorkspaceView(true);
      setMobileView('editor');
      if (!isMobile) togglePane('calendar');
    } else if (id === 'graph') {
      setActiveNav('graph');
      setWorkspaceView(true);
      setMobileView('editor');
      if (!isMobile) togglePane('graph');
    } else if (id === 'git' || id === 'trash') {
      // git/trash 仍为核心硬编码全屏视图
      setActiveNav(id);
      setWorkspaceView(false);
      setMobileView('editor');
      if (id === 'trash') loadTrash();
    } else if (getFrontendPlugin(id)) {
      // [M8] 前端插件导航:view 型 → 全屏主区;pane 型 → 打开/切换分栏面板
      const plugin = getFrontendPlugin(id)!;
      if (plugin.kind === 'view') {
        setActiveNav(id);
        setWorkspaceView(false);
        setMobileView('editor');
      } else if (plugin.kind === 'pane' && plugin.paneId) {
        setActiveNav(id);
        setWorkspaceView(true);
        setMobileView('editor');
        if (!isMobile) togglePane(plugin.paneId);
      }
    } else if (id === 'plugins') {
      setShowPluginManager(true);
    } else if (id === 'settings') {
      setShowSettings(true);
    }
  };

  // [Pane 模板插入] 把模板内容插入当前笔记光标处({{date}} 等变量就地替换)
  const handleInsertTemplate = useCallback((template: NoteTemplate) => {
    setShowTemplateInsert(false);
    let text = template.content || '';
    text = text.replace(/\{\{date\}\}/g, new Date().toLocaleDateString('zh-CN'));
    if (!selectedNote) {
      showToast('请先选择一篇笔记再插入模板', 'info');
      return;
    }
    editorApiRef.current?.insertAtCursor(text);
    showToast(`已插入「${template.name}」模板`);
  }, [selectedNote, showToast]);


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
    // [顶层目录预设] 若当前目录所属顶层目录绑定了预设 → 直接按预设自动新建(模板+命名),
    // 否则打开模板选择弹窗(空白/日记/会议/读书/自定义)。
    const top = findTopLevelFolder(folders, selectedFolderId);
    const preset = getPresetForFolder(folderPresets, top?.id ?? null);
    if (preset && preset.type !== 'none') {
      await createNoteFromPreset(preset);
    } else {
      setShowNewNoteModal(true);
    }
  };

  /** [顶层目录预设] 按顶层目录绑定的预设自动新建:套用预设模板 + 按命名规则生成标题 */
  const createNoteFromPreset = async (preset: FolderPresetConfig) => {
    setShowNewNoteModal(false);
    const resolved = resolvePreset(preset, templates, new Date());
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: resolved.title,
      content: resolved.content,
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
    showToast(`已用「${PRESET_LABELS[preset.type]}」预设创建笔记`);
  };

  /** [M3.5b] 从所选模板新建笔记(替换 {{date}}/{{title}};自定义模板先落库) */
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
    content = content.replace(/\{\{title\}\}/g, '无标题');
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

  /** [M11 看板] 把笔记流转到看板某列:状态写入 content 的 frontmatter 并持久化(不进块,不破坏块级存储) */
  const handleSetKanbanStatus = useCallback(async (note: Note, status: string) => {
    const content = withKanbanStatus(note.content, status);
    const updated: Note = {
      ...note,
      content,
      frontmatter: { ...(note.frontmatter || {}), status: status || '待办' },
      updated_at: Date.now(),
      sync_status: 'pending',
    };
    await backend.saveNote(updated);
    setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
    if (selectedNote?.id === note.id) setSelectedNote(updated);
    showToast(`看板:已移至「${status}」`);
  }, [selectedNote?.id, showToast]);

  /** [M11 收尾] 看板「新建卡片」= 新建一条带目标列 status 的空笔记(复用保存管线,新建即落库) */
  const handleCreateKanbanCard = useCallback(async (status: string) => {
    const content = withKanbanStatus('', status);
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
    showToast(`已在「${status}」新建卡片`);
  }, [selectedFolderId, showToast]);

  /** [M11 收尾] 看板「改标题」= 改笔记标题并持久化(复用编辑/保存流程) */
  const handleRenameKanbanCard = useCallback(async (note: Note, title: string) => {
    const updated = { ...note, title, updated_at: Date.now(), sync_status: 'pending' as const };
    await backend.saveNote(updated);
    setNotes(prev => prev.map(n => n.id === note.id ? updated : n));
    if (selectedNote?.id === note.id) setSelectedNote(updated);
    showToast('卡片标题已更新');
  }, [selectedNote?.id, showToast]);

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

  /** [M11 收尾] 恢复默认工作区布局(清掉用户/旧版布局记忆 → 默认右 dock 分块) */
  const handleResetLayout = () => {
    setPaneLayout(defaultLayout());
    showToast('已恢复默认布局');
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

  // [Pane 命令面板] 可执行动作清单(Ctrl/Cmd+P 弹出)
  const commandActions = useMemo<CommandAction[]>(() => {
    const close = () => setShowCommandPalette(false);
    const diary = templates.find(t => t.category === 'diary');
    return [
      { id: 'new-note', label: '新建笔记', icon: 'plus', hint: 'Ctrl+N', run: () => { close(); handleNewNote(); } },
      { id: 'new-diary', label: '新建日记', icon: 'calendar', hint: '模板', run: () => { close(); if (diary) createNoteFromTemplate(diary); else handleNewNote(); } },
      { id: 'save', label: '保存当前笔记', icon: 'download', hint: 'Ctrl+S', run: () => { close(); editorApiRef.current?.save(); } },
      { id: 'search', label: '搜索笔记', icon: 'search', hint: 'Ctrl+K', run: () => { close(); setShowSearch(true); } },
      { id: 'insert-template', label: '插入模板到当前笔记', icon: 'template', run: () => { close(); setShowTemplateInsert(true); } },
      { id: 'toggle-outline', label: '切换大纲面板', icon: 'outline', run: () => { close(); setWorkspaceView(true); togglePane('outline'); } },
      { id: 'toggle-backlinks', label: '切换反向链接面板', icon: 'backlink', run: () => { close(); setWorkspaceView(true); togglePane('backlinks'); } },
      { id: 'toggle-files', label: '切换文件面板', icon: 'folder', run: () => { close(); setWorkspaceView(true); togglePane('files'); } },
      { id: 'toggle-graph', label: '切换图谱面板', icon: 'graph', run: () => { close(); setWorkspaceView(true); togglePane('graph'); } },
      { id: 'toggle-calendar', label: '切换日历面板', icon: 'calendar', run: () => { close(); setWorkspaceView(true); togglePane('calendar'); } },
      { id: 'toggle-tags', label: '切换标签面板', icon: 'tag', run: () => { close(); setWorkspaceView(true); togglePane('tags'); } },
      { id: 'toggle-pomodoro', label: '切换番茄钟面板', icon: 'timer', run: () => { close(); setWorkspaceView(true); togglePane('pomodoro'); } },
      { id: 'export-md', label: '导出当前为 .md', icon: 'download', run: () => { close(); if (selectedNote) handleExportMarkdown(selectedNote.id); } },
      { id: 'export-html', label: '导出当前为 HTML(可打印 PDF)', icon: 'download', run: () => { close(); if (selectedNote) handleExportHtml(selectedNote.id); } },
      { id: 'open-settings', label: '打开设置', icon: 'settings', hint: 'Ctrl+,', run: () => { close(); setShowSettings(true); } },
    ];
  }, [templates, handleNewNote, createNoteFromTemplate, selectedNote, handleExportMarkdown, handleExportHtml, togglePane]);

  useEffect(() => {
    const isEditableTarget = (e: KeyboardEvent): boolean => {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC:关闭最上层弹窗(命令面板/模板插入/搜索/设置/插件管理/新建模板)
      if (e.key === 'Escape') {
        if (showCommandPalette) { setShowCommandPalette(false); return; }
        if (showTemplateInsert) { setShowTemplateInsert(false); return; }
        if (showSearch || showSettings || showPluginManager || showNewNoteModal) {
          e.preventDefault();
          setShowSearch(false);
          setShowSettings(false);
          setShowPluginManager(false);
          setShowNewNoteModal(false);
        }
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      // Ctrl/Cmd+K 或(非输入态)`/` → 打开搜索
      if ((mod && k === 'k') || (k === '/' && !isEditableTarget(e))) {
        e.preventDefault();
        setShowSearch(true);
        return;
      }
      // Ctrl/Cmd+P → 命令面板
      if (mod && k === 'p') {
        e.preventDefault();
        setShowCommandPalette(v => !v);
        return;
      }
      // Ctrl/Cmd+S → 全局保存(输入框内由 Editor 自身处理,避免双存)
      if (mod && k === 's' && !isEditableTarget(e)) {
        e.preventDefault();
        editorApiRef.current?.save();
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
        // [拖拽调宽] 修复:原 toggle_right_sidebar 切废弃布尔 rightPanelOpen,对真实右 dock 无效;
        // 改为切换 rightDockOpen,控制 PaneWorkspace 右 dock 整体展开/收起(与左栏 Ctrl+[ 对称)。
        [s.toggle_right_sidebar]: () => { e.preventDefault(); setRightDockOpen(prev => !prev); },
      };
      shortcuts[pressed]?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, handleNewNote, handleNewFolder, activeNav, showSearch, showSettings, showPluginManager, showNewNoteModal, showCommandPalette, showTemplateInsert, commandActions]);

  const pomodoroEnabled = plugins.some(p => p.id === 'pomodoro-plugin' && p.enabled);

  // [Pane] 按面板 id 渲染模块组件(编辑器/文件/大纲/反向链接/图谱/日历)
  const renderPane = useCallback((id: PaneId) => {
    switch (id) {
      case 'editor':
        return (
          <div className={`note-tabs-shell note-tabs-${tabPosition}`}>
            {/* [渐进多标签] 顶部/左侧打开笔记历史标签条(仅桌面工作区渲染,移动端单栏不受影响) */}
            <NoteTabs
              ids={openTabs.ids}
              activeId={openTabs.activeId}
              getTitle={id => tabTitles[id] || '未命名'}
              position={tabPosition}
              onSelect={handleSelectTab}
              onClose={handleCloseTab}
              onTogglePosition={() => setTabPosition(p => p === 'top' ? 'left' : 'top')}
            />
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
              onRegisterApi={(api) => { editorApiRef.current = api; }}
              onToggleOutline={() => { setWorkspaceView(true); togglePane('outline'); }}
              onOpenBacklinks={() => { setWorkspaceView(true); togglePane('backlinks'); }}
              onExportMarkdown={handleExportMarkdown}
              onExportHtml={handleExportHtml}
            />
          </div>
        );
      case 'files':
        return (
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
        );
      case 'outline':
        return (
          <OutlinePane
            content={selectedNote?.content || ''}
            onHeadingClick={() => {}}
          />
        );
      case 'backlinks':
        return (
          <BacklinksPane
            noteId={selectedNote?.id || null}
            onSelectNote={jumpToNote}
          />
        );
      case 'properties':
        return (
          <PropertiesPane
            note={selectedNote}
            onSave={handleSaveNote}
          />
        );
      case 'graph':
        return (
          <GraphView
            key={graphKey}
            onSelectNote={(noteId) => {
              const note = notes.find(n => n.id === noteId);
              if (note) { setSelectedNote(note); setMobileView('editor'); }
            }}
            currentNoteId={selectedNote?.id}
            onRefresh={() => setGraphKey(k => k + 1)}
          />
        );
      case 'calendar':
        return <CalendarView onSelectNote={jumpToNote} />;
      case 'tags':
        return (
          <TagsPane
            tags={tags}
            notes={notes}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            onOpenNote={(id, title) => jumpToNote({ id, title })}
          />
        );
      case 'pomodoro':
        return pomodoroEnabled ? <PomodoroTimer settings={settings} /> : <div className="pomodoro-disabled">番茄钟插件未启用,请到设置开启</div>;
      default:
        return null;
    }
  }, [selectedNote, folders, handleSaveNote, handleDeleteNote, settings, pomodoroEnabled,
      handleLinkClick, handleTitleChange, noteBlocks, notes, selectedFolderId, selectedTag,
      tags, handleNewNote, closePane, togglePane, jumpToNote, graphKey, showToast, handleSetKanbanStatus,
      handleCreateKanbanCard, handleRenameKanbanCard, openTabs, tabPosition, tabTitles,
      handleSelectTab, handleCloseTab]);

  if (isLoading) return <div className="loading">加载中...</div>;

  return (
    <div
      className={`app-container ${isMobile ? `mobile-view-${mobileView}` : ''}`}
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
          navItems={navItems}
          activeNav={activeNav}
          onNavClick={handleNavClick}
          collapsed={leftSidebarCollapsed}
          onToggleCollapse={() => setLeftSidebarCollapsed(prev => !prev)}
        />
      </div>

      {/* [拖拽调宽] 左侧栏调宽分隔线(桌面显示;拖动改 --sidebar-width,已记忆 localStorage) */}
      <div
        ref={sidebarResizerRef}
        className="sidebar-resizer"
        onPointerDown={onSidebarResizerDown}
        title="拖拽调整左侧栏宽度"
      />

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

      {/* 主区:工作区 Pane(editor/files/outline/backlinks/graph/calendar)或全屏视图(Git/发布/回收站) */}
      <div className={`main-content ${isMobile ? '' : 'pane-mode'}`} data-panel="main-content">
        <button
          className="mobile-back-btn"
          onClick={() => setMobileView('list')}
          title="返回笔记列表"
        >
          <StrokeIcon name="back" size={20} />
        </button>
        <div className="main-content-inner" data-panel={!workspaceView ? activeNav : 'workspace'}>
          {workspaceView && !isMobile ? (
            <PaneWorkspace
              layout={paneLayout}
              onLayoutChange={setPaneLayout}
              renderPane={renderPane}
              paneEnabled={isPaneAddable}
              rightOpen={rightDockOpen}
            />
          ) : !workspaceView ? (
            activeNav === 'trash' ? (
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
                  if (note && !note.deleted_at) { setSelectedNote(note); handleNavClick('notes'); setMobileView('editor'); }
                  else if (note) showToast('该笔记在回收站中,请先恢复', 'info');
                }}
              />
            ) : activeNav === 'git' ? (
              <GitPanel onClose={() => handleNavClick('notes')} onOpenPublish={() => handleNavClick('publish')} />
            ) : (
              (() => {
                // [M8] view 型前端插件:按 activeNav 查注册表渲染全屏视图(发布 / 看板)
                const vp = getViewPlugin(activeNav);
                return vp?.renderView
                  ? vp.renderView({
                      onClose: () => handleNavClick('notes'),
                      showToast,
                      // [kanban=view] 看板全屏视图所需的数据与操作(注册表 renderView 从 ctx 取;看板数据/回调都在 App)
                      kanban: {
                        notes,
                        onSetStatus: handleSetKanbanStatus,
                        onOpenNote: (noteId) => jumpToNote({ id: noteId, title: '' }),
                        onNewCard: handleCreateKanbanCard,
                        onRename: handleRenameKanbanCard,
                      },
                    })
                  : null;
              })()
            )
          ) : isMobile && activeNav === 'graph' ? (
            <GraphView
              key={graphKey}
              onSelectNote={(noteId) => {
                const note = notes.find(n => n.id === noteId);
                if (note) { setSelectedNote(note); handleNavClick('notes'); setMobileView('editor'); }
              }}
              currentNoteId={selectedNote?.id}
              onRefresh={() => setGraphKey(k => k + 1)}
            />
          ) : isMobile && activeNav === 'calendar' ? (
            <CalendarView onSelectNote={jumpToNote} />
          ) : isMobile && activeNav === 'kanban' ? (
            // 手机端单栏:看板整页展示(工作区 Pane 在手机隐藏,底栏切换)
            <KanbanPane
              notes={notes}
              onSetStatus={handleSetKanbanStatus}
              onOpenNote={(noteId) => jumpToNote({ id: noteId, title: '' })}
              onNewCard={handleCreateKanbanCard}
              onRename={handleRenameKanbanCard}
            />
          ) : (
            /* 手机端单栏:直接渲染编辑器(工作区 Pane 在手机隐藏,底栏切换) */
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
              onRegisterApi={(api) => { editorApiRef.current = api; }}
              onToggleOutline={() => { setWorkspaceView(true); togglePane('outline'); }}
              onOpenBacklinks={() => { setWorkspaceView(true); togglePane('backlinks'); }}
              onExportMarkdown={handleExportMarkdown}
              onExportHtml={handleExportHtml}
            />
          )}
        </div>
        <StatusBar syncEnabled={plugins.some(p => p.id === 'sync-plugin' && p.enabled)} />
      </div>

      {/* 右侧大纲/反向链接已并入工作区 Pane(obsolete 右栏移除) */}

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
          folders={folders}
          folderPresets={folderPresets}
          onFolderPresetsChange={setFolderPresets}
          plugins={plugins}
          onClose={() => setShowSettings(false)}
          onSave={handleSettingsChange}
          onTogglePlugin={handleTogglePlugin}
          onResetLayout={handleResetLayout}
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
          onTemplatesChange={setTemplates}
          onClose={() => setShowNewNoteModal(false)}
        />
      )}

      {showTemplateInsert && (
        <TemplateInsertModal
          templates={templates}
          onInsert={handleInsertTemplate}
          onClose={() => setShowTemplateInsert(false)}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          actions={commandActions}
          onClose={() => setShowCommandPalette(false)}
        />
      )}
    </div>
  );
}
