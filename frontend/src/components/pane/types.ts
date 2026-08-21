/**
 * [Pane 面板化] 工作区布局 —— Obsidian 式「固定主区 + 可切分 dock」
 *
 * 布局形态(2026-08-19 用户拍板):
 *   左 dock(固定)  |  主编辑器(固定)  |  右 dock(可分栏)
 *   - 左 dock:文件导航树 —— 固定,不参与分栏(它的位置和逻辑已经很好)
 *   - 主区:编辑器 —— 固定,不参与分栏(不被拖走/关闭/拆栏)
 *   - 右 dock:大纲/反向链接/标签/图谱/日历/番茄钟 —— 可「上下分栏」+「tab 标签页」+「拖拽」
 *
 * 数据模型:
 *   PaneLayout = {
 *     main: 'editor'                    // 固定主区
 *     left: PaneId[]                    // 左 dock(固定面板组,默认 ['files'])
 *     right: PaneRow[]                  // 右 dock:多「块」,每块可上下分栏 + 内部 tab
 *     hidden: PaneId[]                  // 被关闭、可恢复的面板
 *   }
 *   PaneRow = { id, panes: PaneId[], active }  // 右 dock 的一块;该块内多面板 = tab 组
 *
 * 右 dock 能力:
 *  - 上下分栏:right 有多个 row → 上下堆叠
 *  - tab:同一 row 内多面板 → 标签页(点切换)
 *  - 拖拽:面板可在 row 内换位、拖到另一 row 合并、拖到 dock 上/下边缘新建 row
 *  - 默认布局:每个右 dock 模块各自独立成一块(不堆在一个 tab 组里),可自由上下分块/移动
 */

/** 可用面板模块 id */
export type PaneId = 'editor' | 'files' | 'outline' | 'backlinks' | 'graph' | 'calendar' | 'tags' | 'pomodoro';

/** 右 dock 的一块:一组 tab(同块内面板可切换) */
export interface PaneRow {
  id: string;
  /** 该块内叠放的面板(tab 顺序) */
  panes: PaneId[];
  /** 当前激活的 tab 下标 */
  active: number;
}

/** 整张工作区布局 */
export interface PaneLayout {
  /** 主编辑器(固定,不参与分栏) */
  main: PaneId;
  /** 左 dock(固定面板组,默认文件树) */
  left: PaneId[];
  /** 右 dock:可上下分栏的多块(tab 组) */
  right: PaneRow[];
  /** 被关闭/暂不显示的面板(可在「添加面板」里恢复) */
  hidden: PaneId[];
}

/** 面板元信息 */
export interface PaneMeta {
  id: PaneId;
  label: string;
  icon: string;
  /** 默认归类:left 固定 dock / main 主区 / right 可切分 dock */
  zone: 'left' | 'main' | 'right';
}

/** 全部面板注册表(顺序即「添加面板」菜单顺序) */
export const PANE_REGISTRY: PaneMeta[] = [
  { id: 'editor', label: '编辑器', icon: 'notes', zone: 'main' },
  { id: 'files', label: '文件', icon: 'folder', zone: 'left' },
  { id: 'outline', label: '大纲', icon: 'outline', zone: 'right' },
  { id: 'backlinks', label: '反向链接', icon: 'backlink', zone: 'right' },
  { id: 'graph', label: '图谱', icon: 'graph', zone: 'right' },
  { id: 'calendar', label: '日历', icon: 'calendar', zone: 'right' },
  { id: 'tags', label: '标签', icon: 'tag', zone: 'right' },
  { id: 'pomodoro', label: '番茄钟', icon: 'timer', zone: 'right' },
];

export const PANE_META: Record<PaneId, PaneMeta> = Object.fromEntries(
  PANE_REGISTRY.map(m => [m.id, m]),
) as Record<PaneId, PaneMeta>;

/** 右 dock 可切分的面板集合 */
export const RIGHT_PANES: PaneId[] = PANE_REGISTRY.filter(m => m.zone === 'right').map(m => m.id);

let seq = 0;
const nid = () => `row-${Date.now().toString(36)}-${seq++}`;

/** 默认布局:左文件 | 主编辑器 | 右 dock(每个右 dock 模块各自独立成一块,不堆 tab 组) */
export function defaultLayout(): PaneLayout {
  return {
    main: 'editor',
    left: ['files'],
    // 每个右 dock 模块默认独立一个 group(块),可自由上下分块/移动/合并
    right: RIGHT_PANES.map(id => ({ id: nid(), panes: [id], active: 0 })),
    hidden: [],
  };
}

/** 收集右 dock 全部已显示面板(去重) */
export function collectRightPanes(layout: PaneLayout): PaneId[] {
  const seen = new Set<PaneId>();
  const out: PaneId[] = [];
  layout.right.forEach(r => r.panes.forEach(p => {
    if (!seen.has(p)) { seen.add(p); out.push(p); }
  }));
  return out;
}

/** 右 dock 是否有某面板 */
export function rightHas(layout: PaneLayout, id: PaneId): boolean {
  return collectRightPanes(layout).includes(id);
}
