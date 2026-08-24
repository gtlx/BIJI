/**
 * [M8 前端插件化] 前端插件注册表 —— 克制版
 *
 * 与后端插件化同构(参照 biji-core services/plugin.rs:publish-plugin provides:["publish"]):
 *   - 核心定义「渲染入口接口」,插件声明「我提供这个视图/面板」;
 *   - 导航项 / 主区渲染分支从注册表生成(替换 App.tsx 原先写死的发布三处硬编码);
 *   - 发布(publish)注册为 view 型插件,成为端到端插件样板(后端 provides 能力 + 前端注册表);
 *   - 看板(kanban)为 pane 型插件样板,通过 Pane 系统渲染。
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
    renderView: ctx => <PublishPanel onClose={ctx.onClose} />,
  },
  {
    id: 'kanban',
    label: '看板',
    icon: 'kanban',
    kind: 'pane',
    paneId: 'kanban',
  },
];

/** 按 id 查前端插件 */
export function getFrontendPlugin(id: string): FrontendPlugin | undefined {
  return FRONTEND_PLUGINS.find(p => p.id === id);
}

/** 取 view 型插件(供主区全屏渲染分支查表,替换硬编码) */
export function getViewPlugin(id: string): FrontendPlugin | undefined {
  return FRONTEND_PLUGINS.find(p => p.kind === 'view' && p.id === id && p.renderView);
}

/** 需要出现在导航栏的插件项(view 点击全屏 / pane 点击开面板) */
export function getNavPlugins(): FrontendPlugin[] {
  return FRONTEND_PLUGINS.filter(p => p.kind === 'view' || p.paneId);
}