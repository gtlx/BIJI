/**
 * [M8 前端插件化] 前端插件注册表 —— 克制版
 *
 * 与后端插件化同构(参照 biji-core services/plugin.rs:publish-plugin provides:["publish"]):
 *   - 核心定义「渲染入口接口」,插件声明「我提供这个视图/面板」;
 *   - 导航项 / 主区渲染分支从注册表生成(替换 App.tsx 原先写死的发布三处硬编码);
 *   - 发布(publish)注册为 view 型插件,成为端到端插件样板(后端 provides 能力 + 前端注册表);
 *   - 看板(kanban)为 pane 型插件样板,通过 Pane 系统渲染。
 *
 * [M8 补:插件管理整合] 前端插件也纳入「插件管理」弹窗统一显示/开关:
 *   - 插件 enable 状态用 localStorage + 轻量订阅管理(不必后端持久化,够用即可);
 *   - 关心 enable 状态的取数(getNavPlugins / getFrontendPlugin / getViewPlugin)
 *     一律过滤已禁用插件,实现「关闭 → 导航/渲染里消失」;
 *   - 插件管理弹窗用 getFrontendPluginsForManager() 拿到含禁用项的全量视图。
 *
 * 克制原则:只定义够用的元信息与渲染入口,过度设计留到将来动态加载插件包时再扩展。
 */
import type { ReactNode } from 'react';
import type { PaneId } from '../components/pane/types';
import { PublishPanel } from '../components/PublishPanel';

/** 前端插件作用域:view=独立主区全屏视图,pane=分栏面板 */
export type FrontendPluginKind = 'view' | 'pane';

/** 渲染上下文:App 提供给插件的跨组件回调(view 型插件需要) */
export interface FrontendPluginContext {
  /** 关闭当前视图、回到笔记(对应原 PublishPanel 的 onClose) */
  onClose: () => void;
  /** 全局轻提示 */
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/** 前端插件接口(克制版):元信息 + 渲染入口 */
export interface FrontendPlugin {
  /** 插件唯一 id(与后端 provides 能力呼应:publish ↔ publish-plugin 提供 ["publish"]) */
  id: string;
  /** 导航显示名 */
  label: string;
  /** stroke 图标名(icons.tsx STROKE_ICONS) */
  icon: string;
  /** 作用域:view 全屏主区 / pane 分栏面板 */
  kind: FrontendPluginKind;
  /** 插件版本(插件管理展示用) */
  version: string;
  /** 一句话描述(插件管理展示用) */
  description: string;
  /** view 型:渲染全屏主区视图(如发布) */
  renderView?: (ctx: FrontendPluginContext) => ReactNode;
  /** pane 型:关联的分栏面板 id(点击导航时打开该面板) */
  paneId?: PaneId;
}

/** 内置前端插件注册表:发布 = 端到端样板(view),看板 = 面板样板(pane) */
export const FRONTEND_PLUGINS: FrontendPlugin[] = [
  {
    id: 'publish',
    label: '发布',
    icon: 'publish',
    kind: 'view',
    version: '0.1.0',
    description: '发布笔记到静态站点(后端 publish-plugin 提供能力,本插件为前端入口)',
    renderView: ctx => <PublishPanel onClose={ctx.onClose} />,
  },
  {
    id: 'kanban',
    label: '看板',
    icon: 'kanban',
    kind: 'pane',
    version: '0.1.0',
    description: '三列看板面板(纯前端插件,基于笔记 frontmatter 状态)',
    paneId: 'kanban',
  },
  {
    id: 'calendar',
    label: '日历',
    icon: 'calendar',
    kind: 'pane',
    version: '0.1.0',
    description: '日历热力图面板(内置 pane 型前端插件,可随 enable 开关)',
    paneId: 'calendar',
  },
];

/* ------------------------------------------------------------------ */
/* 前端插件 enable 状态:localStorage + 轻量订阅(克制,不做复杂状态库)     */
/* ------------------------------------------------------------------ */

/**
 * localStorage 键:记录「被显式禁用」的插件 id 集合。
 * 约定:未记录 = 默认启用;记录值 false = 禁用;一旦重新启用即删除记录。
 */
const ENABLED_KEY = 'biji.frontend-plugin.enabled';

/** 读取禁用记录(JSON 容错,解析失败按空处理) */
function loadDisabledMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 订阅回调集合(插件管理弹窗/App 侧各自订阅以感知开关变化) */
const listeners = new Set<() => void>();

/** 判断某前端插件当前是否启用(未显式禁用即视为启用) */
export function isFrontendPluginEnabled(id: string): boolean {
  const map = loadDisabledMap();
  return map[id] !== false;
}

/**
 * 设置某前端插件启停。
 * 持久化到 localStorage,并通知所有订阅者(如 App 重算导航、插件管理重刷列表)。
 */
export function setFrontendPluginEnabled(id: string, enabled: boolean): void {
  const map = loadDisabledMap();
  if (enabled) {
    delete map[id]; // 恢复默认启用,删除记录
  } else {
    map[id] = false; // 记入禁用
  }
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(map));
  } catch {
    /* localStorage 不可用(隐私模式等)静默,本次会话内仍按内存生效 */
  }
  listeners.forEach(l => l());
}

/** 订阅前端插件 enable 变化,返回退订函数(供 React useEffect 清理) */
export function subscribeFrontendPlugins(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------------ */
/* 查询入口(一律关注 enable 状态)                                       */
/* ------------------------------------------------------------------ */

/** 按 id 查前端插件(已启用才命中;禁用时返回 undefined) */
export function getFrontendPlugin(id: string): FrontendPlugin | undefined {
  const p = FRONTEND_PLUGINS.find(p => p.id === id);
  return p && isFrontendPluginEnabled(p.id) ? p : undefined;
}

/** 取 view 型插件(供主区全屏渲染分支查表,替换硬编码);禁用即不渲染 */
export function getViewPlugin(id: string): FrontendPlugin | undefined {
  const p = FRONTEND_PLUGINS.find(p => p.kind === 'view' && p.id === id && p.renderView);
  return p && isFrontendPluginEnabled(p.id) ? p : undefined;
}

/** 需要出现在导航栏的插件项(view 点击全屏 / pane 点击开面板)——仅列已启用插件 */
export function getNavPlugins(): FrontendPlugin[] {
  return FRONTEND_PLUGINS.filter(
    p => (p.kind === 'view' || p.paneId) && isFrontendPluginEnabled(p.id),
  );
}

/**
 * 插件管理弹窗专用的全量前端插件视图:
 * 含禁用项(否则弹窗里无法重新开启),每个带当前启用状态。
 */
export function getFrontendPluginsForManager(): {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: FrontendPluginKind;
  enabled: boolean;
}[] {
  return FRONTEND_PLUGINS.map(p => ({
    id: p.id,
    name: p.label,
    version: p.version,
    description: p.description,
    kind: p.kind,
    enabled: isFrontendPluginEnabled(p.id),
  }));
}

/* ------------------------------------------------------------------ */
/* [M11 收尾] 「添加面板」候选与插件 enable 衔接                          */
/* ------------------------------------------------------------------ */

/**
 * 按分栏面板 id 反查提供它的前端插件(pane 型插件的 paneId 与之对应)。
 * 无则返回 undefined —— 该面板为核心内置面板,不依赖任何前端插件。
 */
export function getFrontendPluginByPane(paneId: PaneId): FrontendPlugin | undefined {
  return FRONTEND_PLUGINS.find(p => p.paneId === paneId);
}

/**
 * 判断某分栏面板当前是否应出现在「添加面板」菜单里:
 * - 核心内置面板(无对应前端插件,如 outline/tags/properties 等)→ 恒可添加;
 * - 由前端插件提供(如 kanban/calendar)→ 仅当该插件已启用才可添加(关闭插件后标题不再入菜单)。
 * 「添加面板」候选列表由 PANE_META 驱动(非插件注册表),这里补上 enable 关注,与导航/渲染一致。
 */
export function isPaneAddable(paneId: PaneId): boolean {
  const plugin = getFrontendPluginByPane(paneId);
  return plugin ? isFrontendPluginEnabled(plugin.id) : true;
}