/**
 * [Pane 面板化] 工作区面板布局类型定义(Obsidian 式多栏并存)
 *
 * 布局模型:一「行」横向多栏(column),每栏内可纵向叠多个面板(pane)。
 * - 分栏:多栏并存(如 编辑器+大纲 并排)
 * - 宽度调整:拖分栏分隔条 → 改相邻两栏 flex 权重
 * - 拖动重排:拖面板标题栏 ↔ 同栏换位 / 跨栏移动 / 拖到边缘新增一栏
 * - 布局记忆:整体结构与每栏权重持久化 localStorage
 */

/** 可用面板模块 id */
export type PaneId = 'editor' | 'files' | 'outline' | 'backlinks' | 'graph' | 'calendar' | 'tags' | 'pomodoro';

/** 单栏:内可纵向叠多个面板,weight 为该栏相对宽度(flex-grow 语义) */
export interface PaneColumn {
  /** 栏稳定 id(重排也不变,用于 React key) */
  id: string;
  /** 相对宽度权重 */
  weight: number;
  /** 纵向叠放的面板(上→下) */
  panes: PaneId[];
}

/** 整张工作区布局 */
export interface PaneLayout {
  /** 横向分栏(左→右) */
  columns: PaneColumn[];
  /** 被关闭/暂不显示的面板(可在「添加面板」里再打开) */
  hidden: PaneId[];
}

/** 面板元信息(标题 / 图标 / 最小宽度等) */
export interface PaneMeta {
  id: PaneId;
  /** 面板名(Display 用) */
  label: string;
  /** StrokeIcon 名 */
  icon: string;
  /** 面板最小宽度占比(拖窄下限) */
  minWeight: number;
}

/** 全部面板注册表(顺序即「添加面板」菜单顺序) */
export const PANE_REGISTRY: PaneMeta[] = [
  { id: 'editor', label: '编辑器', icon: 'notes', minWeight: 0.25 },
  { id: 'files', label: '文件', icon: 'folder', minWeight: 0.12 },
  { id: 'outline', label: '大纲', icon: 'outline', minWeight: 0.1 },
  { id: 'backlinks', label: '反向链接', icon: 'backlink', minWeight: 0.1 },
  { id: 'graph', label: '图谱', icon: 'graph', minWeight: 0.16 },
  { id: 'calendar', label: '日历', icon: 'calendar', minWeight: 0.16 },
  { id: 'tags', label: '标签', icon: 'tag', minWeight: 0.1 },
  { id: 'pomodoro', label: '番茄钟', icon: 'timer', minWeight: 0.1 },
];

export const PANE_META: Record<PaneId, PaneMeta> = Object.fromEntries(
  PANE_REGISTRY.map(m => [m.id, m]),
) as Record<PaneId, PaneMeta>;

/** 默认布局:文件 | 编辑器 | (大纲 / 反向链接) */
export const DEFAULT_LAYOUT: PaneLayout = {
  columns: [
    { id: `col-${'files'}`, weight: 0.24, panes: ['files'] },
    { id: `col-${'editor'}`, weight: 1, panes: ['editor'] },
    { id: `col-${'right'}`, weight: 0.22, panes: ['outline', 'backlinks'] },
  ],
  hidden: ['graph', 'calendar', 'tags', 'pomodoro'],
};

/** 生成新面板布局 */
export function defaultLayout(): PaneLayout {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as PaneLayout;
}
