/**
 * [看板=view] 看板全屏视图 —— 把 KanbanPane 包一层全屏主区容器(供 view 型插件 renderView 用)。
 * 背景:看板由 pane 型改为 view 型后,左侧栏点开走 handleNavClick 的 view 分支 → 全屏主区;
 * 这里仅做「全屏容器 + 关闭按钮」的接线,列/卡片逻辑仍在 KanbanPane(不动它)。
 */
import { KanbanPane } from './KanbanPane';
import type { KanbanPaneProps } from './KanbanPane';
import { StrokeIcon } from '../icons';
import './KanbanView.css';

interface KanbanViewProps {
  /** 关闭当前全屏视图、回到笔记(对齐 PublishPanel 的 onClose) */
  onClose: () => void;
}

/** 看板视图 = KanbanPane 全屏 + 关闭按钮 */
export function KanbanView({ onClose, ...kanbanProps }: KanbanViewProps & KanbanPaneProps) {
  return (
    <div className="kanban-view">
      <div className="kanban-view-header">
        <h2>看板</h2>
        <button className="kanban-view-close" onClick={onClose} title="关闭看板视图">
          <StrokeIcon name="close" size={16} />
        </button>
      </div>
      <div className="kanban-view-body">
        <KanbanPane {...kanbanProps} />
      </div>
    </div>
  );
}