/**
 * [Pane 面板化] 布局持久化小工具(localStorage 记忆)
 *
 * - 保存:结构 + 每栏权重 + 隐藏面板,JSON 落库
 * - 读取:校验合法性(只保留注册过的面板、每栏至少一栏),损坏则回退默认
 */
import type { PaneId, PaneLayout } from './types';
import { PANE_REGISTRY, defaultLayout } from './types';

const STORAGE_KEY = 'biji.paneLayout.v1';

const VALID_IDS = new Set<string>(PANE_REGISTRY.map(m => m.id));

/** 判定一个解出来的布局对象是否结构可用(返回清洗后的布局) */
function sanitize(raw: unknown): PaneLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as PaneLayout;
  if (!Array.isArray(r.columns) || r.columns.length === 0) return null;
  const seen = new Set<PaneId>();
  const columns = r.columns
    .filter(c => c && typeof c === 'object')
    .map((c, i) => {
      const panes = (Array.isArray(c.panes) ? c.panes : [])
        .filter((p): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as PaneId))
        .filter((p) => { seen.add(p); return true; })
        .map(p => p as PaneId);
      return {
        id: typeof c.id === 'string' && c.id ? c.id : `col-${i}`,
        weight: typeof c.weight === 'number' && c.weight > 0 ? c.weight : 1,
        panes: panes.length > 0 ? panes : (['editor'] as PaneId[]),
      };
    })
    .filter(c => c.panes.length > 0);
  if (columns.length === 0) return null;
  const hidden = (Array.isArray(r.hidden) ? r.hidden : [])
    .filter((p): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as PaneId));
  return { columns, hidden };
}

/** 读布局(不存在/损坏 → 默认布局) */
export function loadLayout(): PaneLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout();
    const parsed = JSON.parse(raw);
    const clean = sanitize(parsed);
    return clean ?? defaultLayout();
  } catch {
    return defaultLayout();
  }
}

/** 写布局 */
export function saveLayout(layout: PaneLayout): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* 忽略 */ }
}

/** 生成本地存储 key(供测试/诊断复用) */
export function layoutStorageKey(): string {
  return STORAGE_KEY;
}
