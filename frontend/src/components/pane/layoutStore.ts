/**
 * [Pane 面板化] 布局持久化(localStorage 记忆)
 *
 * - 保存:main/left/right/hidden,JSON 落库
 * - 读取:校验合法性(右 dock 每 row 至少一个面板、面板 id 合法、hidden 不重复),损坏回退默认
 * - 迁移:兼容旧 columns 结构(v1)与新 main/left/right 结构(v2)
 */
import type { PaneId, PaneLayout } from './types';
import { PANE_REGISTRY, RIGHT_PANES, collectRightPanes, defaultLayout } from './types';

const STORAGE_KEY = 'biji.paneLayout.v2';

const VALID_IDS = new Set<string>(PANE_REGISTRY.map(m => m.id));

/**
 * [M11 收尾·严谨迁移] 布局收尾:保证「每个合法右 dock 面板都有归宿」。
 *
 * 背景:M10③ 把右 dock 从「多面板共用一个 tab 组」拆成「每个面板独立成一块」,
 * 但老 localStorage('biji.paneLayout.v2') 存的是拆分前的旧布局(例如某 row 是
 * panes:['outline','backlinks','properties','pomodoro'])。旧布局可能只覆盖了一部分
 * 面板(如没把番茄钟放进任何 row 也没进 hidden),清洗后这些面板会被静默丢弃,
 * 表现为用户桌面端右 dock 找不到番茄钟。
 *
 * 修法:清洗(migrateV1/sanitizeV2)完成后统一走一遍 —— 收集全部右 dock 面板 id,
 * 「已显示」的保持原样;「未显示但合法」的面板一律补进 hidden(可经「添加面板」恢复),
 * 而不是丢进虚空。这样无论旧布局长什么样,番茄钟/日历等右 dock 面板永不丢失。
 */
function finalizeLayout(layout: PaneLayout): PaneLayout {
  const displayed = new Set<PaneId>([layout.main, ...layout.left, ...collectRightPanes(layout)]);
  const hidden = [...layout.hidden];
  RIGHT_PANES.forEach(id => {
    if (!displayed.has(id) && !hidden.includes(id)) hidden.push(id);
  });
  return { ...layout, hidden };
}

/** 判定新结构布局是否可用(返回清洗后的布局) */
function sanitizeV2(raw: any): PaneLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  // 主区
  const main = VALID_IDS.has(raw.main) ? (raw.main as PaneId) : 'editor';
  // 左 dock(过滤非法,默认 files)
  const seen = new Set<string>();
  const left: PaneId[] = (Array.isArray(raw.left) ? raw.left : [])
    .filter((p: unknown): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as string))
    .map((p: PaneId) => { seen.add(p); return p; });
  if (left.length === 0) left.push('files');
  // 右 dock rows
  interface RowLike { id?: unknown; panes?: unknown; active?: unknown }
  const right: NonNullable<ReturnType<typeof sanitizeV2>>['right'] = [];
  (Array.isArray(raw.right) ? raw.right : []).forEach((r: unknown) => {
    const rl = r as RowLike | null;
    if (!rl || typeof rl !== 'object') return;
    const panes: PaneId[] = (Array.isArray(rl.panes) ? rl.panes : [])
      .filter((p: unknown): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as string))
      .map(p => { seen.add(p); return p; });
    if (panes.length === 0) return;
    right.push({
      id: typeof rl.id === 'string' && rl.id ? rl.id : `row-${Math.random().toString(36).slice(2, 8)}`,
      panes,
      active: typeof rl.active === 'number' && rl.active >= 0 && rl.active < panes.length ? rl.active : 0,
    });
  });
  if (right.length === 0) {
    // 无右 dock 时给默认(大纲+反向链接)
    right.push({ id: 'row-fallback', panes: ['outline', 'backlinks'], active: 0 });
  }
  // hidden:不在已显示集合里的合法面板(再经 finalize 补全所有未归位右 dock 面板)
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : [])
    .filter((p: unknown): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as string));
  return finalizeLayout({ main, left, right, hidden });
}

/** 旧 v1 结构(columns) → 新结构迁移 */
function migrateV1(raw: any): PaneLayout | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) return null;
  const seen = new Set<string>();
  const left: PaneId[] = [];
  const right: PaneLayout['right'] = [];
  raw.columns.forEach((c: unknown) => {
    const col = c as { panes?: unknown } | null;
    if (!col || typeof col !== 'object') return;
    const panes: PaneId[] = (Array.isArray(col.panes) ? col.panes : [])
      .filter((p: unknown): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as string))
      .map(p => { seen.add(p); return p; });
    if (panes.length > 0) right.push({ id: `row-${Math.random().toString(36).slice(2, 8)}`, panes, active: 0 });
  });
  // 提取固定区:files → left,editor 归 main,其余 → right
  const editorIdx = right.findIndex(r => r.panes.includes('editor'));
  let main: PaneId = 'editor';
  if (editorIdx >= 0) {
    right[editorIdx].panes = right[editorIdx].panes.filter(p => p !== 'editor');
  }
  const filesRow = right.find(r => r.panes.includes('files'));
  if (filesRow) {
    left.push('files');
    filesRow.panes = filesRow.panes.filter(p => p !== 'files');
  }
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : [])
    .filter((p: unknown): p is PaneId => VALID_IDS.has(p as string) && !seen.has(p as string));
  return finalizeLayout({ main, left: left.length ? left : ['files'], right: right.filter(r => r.panes.length > 0), hidden });
}

/** 读布局(不存在/损坏 → 默认布局) */
export function loadLayout(): PaneLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // 尝试迁移旧 v1
      const old = localStorage.getItem('biji.paneLayout.v1');
      if (old) {
        const migrated = migrateV1(JSON.parse(old));
        if (migrated) return migrated;
      }
      return defaultLayout();
    }
    const parsed = JSON.parse(raw);
    const clean = sanitizeV2(parsed);
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
