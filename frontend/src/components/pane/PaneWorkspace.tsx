/**
 * [Pane 面板化] 工作区 Pane 容器(Obsidian 式多栏并存)
 *
 * 能力:
 *  - 分栏:横向多栏,栏内纵向叠面板
 *  - 宽度拖拽:拖分栏分隔条(division bar)调整相邻栏宽度
 *  - 面板拖动重排:拖标题栏 → 同栏换位 / 跨栏移动 / 拖到工作区左右边缘新增一栏
 *  - 布局记忆:结构 + 权重由父级持状态并落 localStorage
 *
 * 实现:全部用 pointer events + 原生 flex,不引第三方布局库。
 */
import { useEffect, useRef, useState } from 'react';
import type { PaneColumn, PaneId, PaneLayout } from './types';
import { PANE_META, PANE_REGISTRY } from './types';
import { StrokeIcon } from '../../icons';
import './Pane.css';

/** 拖到工作区左/右边缘多少 px 内视为「新增一栏」 */
const EDGE_ZONE = 56;
/** 栏最小宽度(px) */
const MIN_COL_PX = 120;

interface PaneWorkspaceProps {
  layout: PaneLayout;
  onLayoutChange: (l: PaneLayout) => void;
  /** 渲染某个面板的内容(模块组件由父级按 id 分发) */
  renderPane: (id: PaneId) => React.ReactNode;
}

/** 拖动中的目标指示:插入到某栏某面板前/后 */
interface DropTarget {
  colIndex: number;
  paneIndex: number;
  before: boolean;
}
/** 边缘新栏指示 */
interface EdgeTarget {
  side: 'left' | 'right';
}

let colSeq = 0;
const nextColId = () => `col-${Date.now().toString(36)}-${colSeq++}`;

export function PaneWorkspace({ layout, onLayoutChange, renderPane }: PaneWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /** 正在拖拽的面板 + 其来源(栏/位置) */
  const [drag, setDrag] = useState<{ pane: PaneId; fromCol: number; fromIdx: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** 拖拽过程中的落点指示(面板前/后) */
  const [target, setTarget] = useState<DropTarget | null>(null);
  /** 拖到左右边缘 → 新增一栏 */
  const [edge, setEdge] = useState<EdgeTarget | null>(null);

  /** 分栏宽度拖拽状态:正在拖的分隔条下标 */
  const [sizing, setSizing] = useState<number | null>(null);

  /** [打磨] 「添加面板」菜单是否展开(状态化,替代 DOM classList 切换) */
  const [menuOpen, setMenuOpen] = useState(false);

  // [打磨] 点击面板区域外 → 收起「添加面板」菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (t && containerRef.current) {
        const wrap = containerRef.current.querySelector('.pane-add-menu-wrap');
        if (wrap && wrap.contains(t)) return;
      }
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, [menuOpen]);

  // ---------------- 面板拖动 ----------------

  const findTarget = (x: number, y: number): { t: DropTarget | null; e: EdgeTarget | null } => {
    const cont = containerRef.current;
    if (!cont || !drag) return { t: null, e: null };
    const rect = cont.getBoundingClientRect();
    // 左右边缘 → 新栏
    if (x - rect.left < EDGE_ZONE) return { t: null, e: { side: 'left' } };
    if (rect.right - x < EDGE_ZONE) return { t: null, e: { side: 'right' } };

    // 命中某个面板标题栏(headers 打上 data-pane / data-col / data-idx)
    const headers = cont.querySelectorAll<HTMLElement>('.pane-header');
    let best: DropTarget | null = null;
    let bestDist = Infinity;
    headers.forEach(h => {
      const hr = h.getBoundingClientRect();
      if (y < hr.top || y > hr.bottom) return;
      if (x < hr.left || x > hr.right) return;
      const mid = (hr.left + hr.right) / 2;
      const dist = Math.abs(x - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          colIndex: Number(h.dataset.col),
          paneIndex: Number(h.dataset.idx),
          before: x < mid,
        };
      }
    });
    return { t: best, e: null };
  };

  const onHeaderDown = (e: React.PointerEvent, pane: PaneId, colIndex: number, paneIndex: number) => {
    e.preventDefault();
    setDrag({ pane, fromCol: colIndex, fromIdx: paneIndex });
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    if (e.currentTarget instanceof Element) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHeaderMove = (e: React.PointerEvent) => {
    if (!drag) return;
    dragPosRef.current = { x: e.clientX, y: e.clientY };
    const { t, e: edgeT } = findTarget(e.clientX, e.clientY);
    setTarget(t);
    setEdge(edgeT);
  };

  const onHeaderUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const targetFinal = target;
    const edgeFinal = edge;
    const fromCol = drag.fromCol;
    const fromIdx = drag.fromIdx;
    const pane = drag.pane;
    setDrag(null);
    setTarget(null);
    setEdge(null);
    if (e.currentTarget instanceof Element) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const columns = layout.columns.map(c => ({ ...c, panes: [...c.panes] }));
    if (edgeFinal) {
      // 新栏
      const moving = columns[fromCol]!.panes.splice(fromIdx, 1)[0];
      const newCol: PaneColumn = { id: nextColId(), weight: 0.2, panes: [moving] };
      const next = [...columns];
      next.splice(edgeFinal.side === 'left' ? 0 : next.length, 0, newCol);
      onLayoutChange({ ...layout, columns: next });
      return;
    }
    if (targetFinal) {
      const destCol = columns[targetFinal.colIndex];
      if (!destCol) return;
      // 从源栏移除
      const moving = columns[fromCol]!.panes.splice(fromIdx, 1)[0];
      if (!moving) return;
      // 目标位置:同栏内向后插入时移除导致下标偏移 1,需修正
      let idx = targetFinal.paneIndex;
      if (targetFinal.colIndex === fromCol && fromIdx < targetFinal.paneIndex) {
        idx -= 1;
      }
      idx = Math.max(0, Math.min(idx, destCol.panes.length));
      destCol.panes.splice(idx, 0, moving);
      // 移除空栏
      const cleaned = columns.filter(c => c.panes.length > 0);
      onLayoutChange({ ...layout, columns: cleaned });
      return;
    }
    // 无目标:还原不动
  };

  // 拖动/缩放中禁用文本选择 & 加全局拖尾跟随样式
  useEffect(() => {
    if (drag || sizing !== null) {
      document.body.classList.add('pane-dragging');
    } else {
      document.body.classList.remove('pane-dragging');
    }
  }, [drag, sizing]);

  // ---------------- 分栏宽度拖拽 ----------------

  const startSizing = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    setSizing(index);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSizeMove = (e: React.PointerEvent) => {
    if (sizing === null) return;
    const cont = containerRef.current;
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    const cols = layout.columns;
    if (sizing < 0 || sizing >= cols.length - 1) return;
    const leftCol = cols[sizing]!;
    const rightCol = cols[sizing + 1]!;
    const totalW = cols.reduce((a, c) => a + c.weight, 0) || 1;
    // 分隔条当前 x 位置(按权重比例算)
    const leftPx = (cols.slice(0, sizing + 1).reduce((a, c) => a + c.weight, 0) / totalW) * rect.width;
    const delta = e.clientX - (rect.left + leftPx);
    // 转回权重增量
    const unit = totalW / rect.width;
    const dWeight = delta * unit;
    const newLeft = leftCol.weight + dWeight;
    const newRight = rightCol.weight - dWeight;
    const minL = (MIN_COL_PX / rect.width) * totalW;
    if (newLeft < minL || newRight < minL) return;
    const next = cols.map((c, i) =>
      i === sizing ? { ...c, weight: newLeft }
        : i === sizing + 1 ? { ...c, weight: newRight }
          : c,
    );
    onLayoutChange({ ...layout, columns: next });
  };

  const endSizing = (e: React.PointerEvent) => {
    if (sizing === null) return;
    setSizing(null);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // ---------------- 面板开关 ----------------

  const closePane = (pane: PaneId) => {
    const columns = layout.columns
      .map(c => ({ ...c, panes: c.panes.filter(p => p !== pane) }))
      .filter(c => c.panes.length > 0);
    const hidden = [...layout.hidden, pane];
    onLayoutChange({ columns: columns.length > 0 ? columns : [{ id: nextColId(), weight: 1, panes: ['editor'] }], hidden });
  };

  const addPane = (pane: PaneId) => {
    const hidden = layout.hidden.filter(p => p !== pane);
    // 若已显示则不重复添加
    const already = layout.columns.some(c => c.panes.includes(pane));
    let columns = layout.columns.map(c => ({ ...c, panes: [...c.panes] }));
    if (already) {
      onLayoutChange({ columns, hidden });
      return;
    }
    // 追加到最右栏(或新增一栏)
    if (columns.length > 0) {
      columns[columns.length - 1] = {
        ...columns[columns.length - 1]!,
        panes: [...columns[columns.length - 1]!.panes, pane],
      };
    } else {
      columns = [{ id: nextColId(), weight: 1, panes: [pane] }];
    }
    onLayoutChange({ columns, hidden });
  };

  const canAdd = layout.hidden.length > 0;

  return (
    <div className="pane-workspace" ref={containerRef}>
      <div className="pane-columns">
        {layout.columns.map((col, ci) => {
          const colPxWeight = col.weight;
          return (
            <div
              key={col.id}
              className="pane-column"
              style={{ flexGrow: colPxWeight, flexBasis: 0, minWidth: MIN_COL_PX }}
            >
              {col.panes.map((paneId, pi) => {
                const meta = PANE_META[paneId];
                const isDragging = drag?.pane === paneId;
                return (
                  <div
                    key={paneId}
                    className={`pane ${isDragging ? 'dragging' : ''} ${target && target.colIndex === ci && target.paneIndex === pi ? (target.before ? 'target-before' : 'target-after') : ''}`}
                    data-pane={paneId}
                  >
                    <div
                      className="pane-header"
                      data-col={ci}
                      data-idx={pi}
                      onPointerDown={(e) => onHeaderDown(e, paneId, ci, pi)}
                      onPointerMove={onHeaderMove}
                      onPointerUp={onHeaderUp}
                      title="按住拖动可重排;拖到边缘可分栏"
                    >
                      <span className="pane-head-icon"><StrokeIcon name={meta.icon} size={16} /></span>
                      <span className="pane-head-title">{meta.label}</span>
                      <button
                        className="pane-close"
                        title={`关闭 ${meta.label} 面板`}
                        onClick={(e) => { e.stopPropagation(); closePane(paneId); }}
                      >
                        <StrokeIcon name="close" size={14} />
                      </button>
                    </div>
                    <div className="pane-body">{renderPane(paneId)}</div>
                  </div>
                );
              })}
              {ci < layout.columns.length - 1 && (
                <div
                  className={`pane-divider ${sizing === ci ? 'active' : ''}`}
                  onPointerDown={(e) => startSizing(e, ci)}
                  onPointerMove={onSizeMove}
                  onPointerUp={endSizing}
                  title="拖拽调整栏宽"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 添加面板按钮:列出未展示面板,点击恢复(含 标签/番茄钟) */}
      {canAdd && (
        <div className="pane-add-menu-wrap">
          <button
            className={`pane-add-btn ${menuOpen ? 'open' : ''}`}
            title="添加面板"
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
          >
            <StrokeIcon name="plus" size={16} />
          </button>
          <div className={`pane-add-menu ${menuOpen ? 'open' : ''}`}>
            {PANE_REGISTRY.filter(m => layout.hidden.includes(m.id)).map(m => (
              <button
                key={m.id}
                className="pane-add-item"
                onClick={() => { addPane(m.id); setMenuOpen(false); }}
              >
                <StrokeIcon name={m.icon} size={15} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 拖拽落点光学指引 */}
      {drag && (
        <div className="pane-drag-ghost" style={{ left: dragPosRef.current.x, top: dragPosRef.current.y }}>
          <StrokeIcon name={PANE_META[drag.pane].icon} size={14} />
          <span>{PANE_META[drag.pane].label}</span>
        </div>
      )}
      {edge && (
        <div className={`pane-edge-zone ${edge.side}`}>
          <span>分栏</span>
        </div>
      )}
    </div>
  );
}
