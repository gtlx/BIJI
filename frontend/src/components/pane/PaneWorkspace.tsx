/**
 * [Pane 面板化] 工作区容器 —— 固定左 dock + 固定主区 + 可切分右 dock
 *
 * 布局(2026-08-19 用户拍板):
 *   左 dock(固定文件) | 主区(固定编辑器) | 右 dock(可上下分栏 + tab + 拖拽)
 *
 * 右 dock:
 *  - 多 row = 上下分栏(块);默认每个模块独立成一块(不堆 tab 组)
 *  - 每 row 多 panel = tab 标签页
 *  - 拖拽:拖 tab → row 内换位 / 跨 row 合并 / 拖到 dock 上/下边缘新增 row
 *
 * 主区/左 dock 固定:不参与分栏、不可被拖走/关闭。
 * 实现:全部 pointer events + 原生 flex,不引第三方布局库。
 */
import { useEffect, useRef, useState } from 'react';
import type { PaneId, PaneLayout, PaneRow } from './types';
import { PANE_META, PANE_REGISTRY } from './types';
import { StrokeIcon } from '../../icons';
import './Pane.css';

/** 拖到 dock 上/下边缘多少 px 内视为「新增一块(上下分栏)」 */
const EDGE_ZONE = 40;

interface PaneWorkspaceProps {
  layout: PaneLayout;
  onLayoutChange: (l: PaneLayout) => void;
  /** 渲染某个面板的内容(模块组件由父级按 id 分发) */
  renderPane: (id: PaneId) => React.ReactNode;
  /**
   * [M11 收尾] 判断某分栏面板可否被「添加面板」菜单恢复(默认恒可)。
   * 用于把 PANE_META 驱动的候选列表对接前端插件 enable:插件提供的面板
   * (如看板 kanban)在该插件被禁用时从「添加面板」菜单消失,与导航/渲染行为一致。
   */
  paneEnabled?: (id: PaneId) => boolean;
}

/** 拖动中的目标:插入到某 row 某 tab 前/后 */
interface DropTarget {
  rowIndex: number;
  tabIndex: number;
  before: boolean;
}
/** 上下边缘新块指示 */
interface EdgeTarget {
  side: 'top' | 'bottom';
}

let rowSeq = 0;
const nextRowId = () => `row-${Date.now().toString(36)}-${rowSeq++}`;

export function PaneWorkspace({ layout, onLayoutChange, renderPane, paneEnabled }: PaneWorkspaceProps) {
  const dockRef = useRef<HTMLDivElement>(null);

  /** 正在拖拽的面板 + 来源 row */
  const [drag, setDrag] = useState<{ pane: PaneId; fromRow: number; fromIdx: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [edge, setEdge] = useState<EdgeTarget | null>(null);

  /** 右 dock 某 row 内激活 tab(不落库,运行时) */
  const [activeOverride, setActiveOverride] = useState<Record<string, number>>({});

  /** 右 dock 某块内拖拽调高(上下分栏比例) */
  const [sizing, setSizing] = useState<number | null>(null);
  const rowHeights = useRef<{ x: number }>({ x: 0 });

  /** 「添加面板」菜单 */
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (t && dockRef.current) {
        const wrap = dockRef.current.querySelector('.pane-add-menu-wrap');
        if (wrap && wrap.contains(t)) return;
      }
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, [menuOpen]);

  // 布局结构变化时清理失效激活 tab
  useEffect(() => {
    setActiveOverride(prev => {
      const next: Record<string, number> = {};
      let changed = false;
      layout.right.forEach(r => {
        const cur = prev[r.id];
        const v = typeof cur === 'number' && cur < r.panes.length ? cur : r.active ?? 0;
        if (v !== cur) changed = true;
        next[r.id] = v;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.right]);

  // ---------------- 右 dock 面板拖动 ----------------

  const findTarget = (x: number, y: number): { t: DropTarget | null; e: EdgeTarget | null } => {
    const dock = dockRef.current;
    if (!dock || !drag) return { t: null, e: null };

    // ① 优先:命中某个 tab → 合并进该 group(Obsidian:拖到 tab 栏即并排合并)
    const tabs = dock.querySelectorAll<HTMLElement>('.pane-tab');
    let best: DropTarget | null = null;
    let bestDist = Infinity;
    tabs.forEach(t => {
      const tr = t.getBoundingClientRect();
      if (y < tr.top || y > tr.bottom) return;
      if (x < tr.left || x > tr.right) return;
      const mid = (tr.left + tr.right) / 2;
      const dist = Math.abs(x - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          rowIndex: Number(t.dataset.row),
          tabIndex: Number(t.dataset.idx),
          before: x < mid,
        };
      }
    });

    // ② 其次:拖到右 dock 上/下边缘 → 新开一块(上下分块)
    //    必须在 dock 边缘之前判定:否则 group 空白区会先命中,上/下边缘永远提示「合并」而非「分块」。
    //    横向限定在 dock 范围内(±12px 容差):避免拖出 dock(向左/向右)时误触发「分块」提示。
    if (!best) {
      const rect = dock.getBoundingClientRect();
      const inX = x >= rect.left - 12 && x <= rect.right + 12;
      if (inX) {
        if (y - rect.top < EDGE_ZONE) return { t: null, e: { side: 'top' } };
        if (rect.bottom - y < EDGE_ZONE) return { t: null, e: { side: 'bottom' } };
      }
    }
    // ③ 最后:命中某 group 的空白区 → 追加到该 group 末尾(合并)
    if (!best) {
      const rowEls = dock.querySelectorAll<HTMLElement>('.pane-row');
      for (let i = 0; i < rowEls.length; i++) {
        const rr = rowEls[i].getBoundingClientRect();
        if (x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom) {
          const panes = layout.right[i]?.panes ?? [];
          best = { rowIndex: i, tabIndex: panes.length, before: false };
          break;
        }
      }
    }
    return { t: best, e: null };
  };

  const onTabDown = (e: React.PointerEvent, pane: PaneId, rowIndex: number, tabIndex: number) => {
    e.preventDefault();
    setDrag({ pane, fromRow: rowIndex, fromIdx: tabIndex });
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    if (e.currentTarget instanceof Element) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onTabMove = (e: React.PointerEvent) => {
    if (!drag) return;
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    const { t, e: edgeT } = findTarget(e.clientX, e.clientY);
    setTarget(t);
    setEdge(edgeT);
  };

  const onTabUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const targetFinal = target;
    const edgeFinal = edge;
    const fromRow = drag.fromRow;
    const fromIdx = drag.fromIdx;
    const pane = drag.pane;
    setDrag(null); setTarget(null); setEdge(null);
    if (e.currentTarget instanceof Element) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const rows = layout.right.map(r => ({ ...r, panes: [...r.panes], active: activeOverride[r.id] ?? r.active ?? 0 }));
    if (edgeFinal) {
      // 上/下边缘 → 新块
      const moving = rows[fromRow]!.panes.splice(fromIdx, 1)[0];
      if (!moving) return;
      const newRow: PaneRow = { id: nextRowId(), panes: [moving], active: 0 };
      const next = [...rows];
      next.splice(edgeFinal.side === 'top' ? 0 : next.length, 0, newRow);
      // 原块被拖空后移除,避免留下空白块
      onLayoutChange({ ...layout, right: next.filter(r => r.panes.length > 0) });
      return;
    }
    if (targetFinal) {
      const destRow = rows[targetFinal.rowIndex];
      if (!destRow) return;
      const moving = rows[fromRow]!.panes.splice(fromIdx, 1)[0];
      if (!moving) return;
      let idx = targetFinal.tabIndex;
      if (targetFinal.rowIndex === fromRow && fromIdx < targetFinal.tabIndex) idx -= 1;
      idx = Math.max(0, Math.min(idx, destRow.panes.length));
      destRow.panes.splice(idx, 0, moving);
      const cleaned = rows.filter(r => r.panes.length > 0);
      onLayoutChange({ ...layout, right: cleaned });
      return;
    }
  };

  useEffect(() => {
    if (drag || sizing !== null) {
      document.body.classList.add('pane-dragging');
    } else {
      document.body.classList.remove('pane-dragging');
    }
  }, [drag, sizing]);

  // ---------------- 右 dock 上下块 调高 ----------------

  const startSizing = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    setSizing(index);
    rowHeights.current.x = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSizeMove = (e: React.PointerEvent) => {
    if (sizing === null) return;
    // 上下分栏高度:用 flex 权重,这里通过动态 style 调整(存于 DOM)
    const dock = dockRef.current;
    if (!dock) return;
    const rows = dock.querySelectorAll<HTMLElement>('.pane-row');
    if (sizing < 0 || sizing >= rows.length - 1) return;
    const top = rows[sizing]!;
    const bottom = rows[sizing + 1]!;
    const dockRect = dock.getBoundingClientRect();
    const delta = rowHeights.current.x - e.clientY;
    // 把像素增量转成比例(以 row 当前高度为基准,粗略)
    const totalH = dockRect.height;
    const topFrac = (top.offsetHeight - delta) / totalH;
    const botFrac = (bottom.offsetHeight + delta) / totalH;
    const minFrac = 0.12;
    if (topFrac < minFrac || botFrac < minFrac) return;
    top.style.flexGrow = Math.max(topFrac, minFrac).toFixed(3);
    bottom.style.flexGrow = Math.max(botFrac, minFrac).toFixed(3);
  };

  const endSizing = (e: React.PointerEvent) => {
    if (sizing === null) return;
    setSizing(null);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // ---------------- 右 dock 面板开关 ----------------

  const closePane = (pane: PaneId) => {
    const right = layout.right
      .map(r => ({ ...r, panes: r.panes.filter(p => p !== pane) }))
      .filter(r => r.panes.length > 0);
    const hidden = layout.hidden.includes(pane) ? layout.hidden : [...layout.hidden, pane];
    onLayoutChange({ ...layout, right, hidden });
  };

  const addPane = (pane: PaneId) => {
    const hidden = layout.hidden.filter(p => p !== pane);
    const already = layout.right.some(r => r.panes.includes(pane));
    if (already) {
      // 已在右 dock,仅从 hidden 移除
      onLayoutChange({ ...layout, hidden });
      return;
    }
    const right = layout.right.map(r => ({ ...r, panes: [...r.panes], active: activeOverride[r.id] ?? r.active ?? 0 }));
    // 新增面板默认独立成一块(自己一个 group,不并入最后一个 tab 组),
    // 之后可自由拖动到 dock 任意位置/与其他 group 合并
    right.push({ id: nextRowId(), panes: [pane], active: 0 });
    onLayoutChange({ ...layout, right, hidden });
  };

  // ---------------- 渲染 ----------------

  const activeOf = (r: PaneRow) => activeOverride[r.id] ?? r.active ?? 0;
  // [M11 收尾] 「添加面板」只列「已关闭且当前可恢复」的面板:
  // 插件提供的面板若其插件被禁用,则不再出现在候选里(避免关了插件还把它加回来)。
  const addableHidden = layout.hidden.filter(id => paneEnabled ? paneEnabled(id) : true);
  const canAdd = addableHidden.length > 0;

  return (
    <div className="pane-workspace">
      {/* 左 dock(固定,不参与分栏) */}
      <div className="pane-left">
        {layout.left.map(paneId => (
          <div className="pane pane-fixed" key={paneId} data-pane={paneId}>
            <div className="pane-body">{renderPane(paneId)}</div>
          </div>
        ))}
      </div>

      {/* 主区(固定编辑器,不参与分栏) */}
      <div className="pane-main" data-pane={layout.main}>
        <div className="pane-body pane-main-body">{renderPane(layout.main)}</div>
      </div>

      {/* 右 dock(可上下分栏 + tab + 拖拽) */}
      <div className="pane-right" ref={dockRef}>
        <div className="pane-right-rows">
          {layout.right.map((row, ri) => {
            const active = activeOf(row);
            const showTabs = row.panes.length > 1;
            return (
              <div
                key={row.id}
                className="pane-row"
                style={{ flexGrow: 1, flexBasis: 0, minHeight: 80 }}
              >
                {/* tab 条(多面板时) */}
                {showTabs && (
                  <div className="pane-tabs">
                    {row.panes.map((paneId, pi) => {
                      const meta = PANE_META[paneId];
                      const isActive = pi === active;
                      const isDragging = drag?.pane === paneId && drag.fromRow === ri;
                      // 拖拽合并落点指示:插到某 tab 前(标记该 tab 左缘)
                      const dropHere =
                        !!target && target.rowIndex === ri &&
                        ((target.before && target.tabIndex === pi) || (!target.before && target.tabIndex === pi - 1));
                      return (
                        <div
                          key={paneId}
                          className={`pane-tab ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${dropHere ? 'drop-before' : ''}`}
                          role="tab"
                          aria-selected={isActive}
                          data-row={ri}
                          data-idx={pi}
                          onPointerDown={(e) => onTabDown(e, paneId, ri, pi)}
                          onPointerMove={onTabMove}
                          onPointerUp={onTabUp}
                          onClick={() => { if (!drag) setActiveOverride(prev => ({ ...prev, [row.id]: pi })); }}
                          title="点击切换;按住拖动可重排/上下分块"
                        >
                          <StrokeIcon name={meta.icon} size={14} />
                          <span className="pane-tab-title">{meta.label}</span>
                          <button
                            className="pane-tab-close"
                            title={`关闭 ${meta.label}`}
                            // 阻断 pointerdown 冒泡到 tab 的 onTabDown(其 e.preventDefault 会吞掉后续 click,导致点 X 不生效)
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); closePane(paneId); }}
                          >
                            <StrokeIcon name="close" size={12} />
                          </button>
                        </div>
                      );
                    })}
                    {/* 追加到本组末尾的落点指示(插到最后一个 tab 之后) */}
                    {target && target.rowIndex === ri && !target.before && target.tabIndex === row.panes.length && (
                      <div className="pane-tab-drop-end" />
                    )}
                  </div>
                )}
                {/* 内容区:显示激活的 tab(多面板)或唯一面板 */}
                {row.panes.map((paneId, pi) => {
                  if (showTabs && pi !== active) return null;
                  const meta = PANE_META[paneId];
                  const isDragging = drag?.pane === paneId && drag.fromRow === ri;
                  return (
                    <div key={paneId} className={`pane pane-right-pane ${isDragging ? 'dragging' : ''}`} data-pane={paneId}>
                      {showTabs ? (
                        <div className="pane-body pane-body-tabbed">{renderPane(paneId)}</div>
                      ) : (
                        <>
                          <div
                            className="pane-header"
                            data-row={ri}
                            data-idx={pi}
                            onPointerDown={(e) => onTabDown(e, paneId, ri, pi)}
                            onPointerMove={onTabMove}
                            onPointerUp={onTabUp}
                            title="按住拖动可重排/上下分块"
                          >
                            <span className="pane-head-icon"><StrokeIcon name={meta.icon} size={16} /></span>
                            <span className="pane-head-title">{meta.label}</span>
                            <button className="pane-close" title={`关闭 ${meta.label}`}
                              // 阻断 pointerdown 冒泡到 header 的 onTabDown(其 e.preventDefault 会吞掉后续 click,导致点 X 不生效)
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); closePane(paneId); }}>
                              <StrokeIcon name="close" size={14} />
                            </button>
                          </div>
                          <div className="pane-body">{renderPane(paneId)}</div>
                        </>
                      )}
                    </div>
                  );
                })}
                {/* 上下分栏分隔条 */}
                {ri < layout.right.length - 1 && (
                  <div
                    className="pane-hdivider"
                    onPointerDown={(e) => startSizing(e, ri)}
                    onPointerMove={onSizeMove}
                    onPointerUp={endSizing}
                    title="拖拽调整上下高度"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 添加面板:列出隐藏面板 */}
        {canAdd && (
          <div className="pane-add-menu-wrap" style={{ position: 'absolute', right: 12, bottom: 12 }}>
            <button
              className={`pane-add-btn ${menuOpen ? 'open' : ''}`}
              title="添加面板"
              aria-expanded={menuOpen}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
            >
              <StrokeIcon name="plus" size={16} />
            </button>
            <div className={`pane-add-menu ${menuOpen ? 'open' : ''}`}>
              {PANE_REGISTRY.filter(m => addableHidden.includes(m.id)).map(m => (
                <button key={m.id} className="pane-add-item"
                  onClick={() => { addPane(m.id); setMenuOpen(false); }}>
                  <StrokeIcon name={m.icon} size={15} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 拖拽幽灵 */}
      {drag && (
        <div className="pane-drag-ghost" style={{ left: dragPosRef.current.x, top: dragPosRef.current.y }}>
          <StrokeIcon name={PANE_META[drag.pane].icon} size={14} />
          <span>{PANE_META[drag.pane].label}</span>
        </div>
      )}
      {/* 拖到上/下边缘的「分块」落点提示(方向:上/下) */}
      {edge && (
        <div className={`pane-edge-zone ${edge.side}`}>
          <span>{edge.side === 'top' ? '▲ 向上分块' : '▼ 向下分块'}</span>
        </div>
      )}
    </div>
  );
}
