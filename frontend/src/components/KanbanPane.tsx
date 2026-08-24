/**
 * [M11 看板] 看板分栏面板 —— 把笔记按状态分列展示/流转(克制版)
 *
 * - 三列:待办 → 进行中 → 已完成(状态承载于笔记 content 顶部 frontmatter 的 `status:`,
 *   通过 utils/frontmatter.ts 读写,不进块,不破坏块级存储);
 * - 每列列出一篇笔记一张卡片,点卡片标题 = 点开该笔记(打开编辑器);
 * - 卡片上的 ◀ / ▶ 按钮把该笔记在相邻列间流转(最小可用,无拖拽;DND 留后续);
 * - 点开并切换状态通过 prop 回调交给 App 持久化(backend.saveNote + notes state 同步)。
 */
import type { Note } from '../api/backend';
import { getNoteKanbanStatus } from '../utils/frontmatter';
import { StrokeIcon } from '../icons';
import './KanbanPane.css';

/** 看板三列(顺序即流转方向) */
export const KANBAN_STATUSES = ['待办', '进行中', '已完成'] as const;
export type KanbanStatus = typeof KANBAN_STATUSES[number];

const COLUMNS: { id: string; label: string }[] = [
  { id: 'todo', label: '待办' },
  { id: 'doing', label: '进行中' },
  { id: 'done', label: '已完成' },
];

interface KanbanPaneProps {
  notes: Note[];
  /** 把某篇笔记流转到某列(持久化由 App 负责) */
  onSetStatus: (note: Note, status: string) => void;
  /** 点开某篇笔记(打开编辑器) */
  onOpenNote: (noteId: string) => void;
}

/** 归一化状态:未知状态一律落到「待办」 */
function normalize(status: string): string {
  return KANBAN_STATUSES.includes(status as KanbanStatus) ? status : '待办';
}

export function KanbanPane({ notes, onSetStatus, onOpenNote }: KanbanPaneProps) {
  const live = notes.filter(n => !n.deleted_at);
  const byStatus = (col: string) => live.filter(n => normalize(getNoteKanbanStatus(n.content)) === col);

  const move = (note: Note, dir: -1 | 1) => {
    const cur = KANBAN_STATUSES.indexOf(normalize(getNoteKanbanStatus(note.content)) as KanbanStatus);
    const nextIdx = cur + dir;
    if (nextIdx < 0 || nextIdx >= KANBAN_STATUSES.length) return;
    onSetStatus(note, KANBAN_STATUSES[nextIdx]);
  };

  return (
    <div className="kanban-pane">
      <div className="kanban-columns">
        {COLUMNS.map(col => {
          const items = byStatus(col.label);
          const colIdx = KANBAN_STATUSES.indexOf(col.label as KanbanStatus);
          return (
            <div key={col.id} className={`kanban-column kanban-col-${col.id}`}>
              <div className="kanban-col-head">
                <span className="kanban-col-dot" />
                <span className="kanban-col-title">{col.label}</span>
                <span className="kanban-col-count">{items.length}</span>
              </div>
              <div className="kanban-col-body">
                {items.length === 0 && (
                  <div className="kanban-col-empty">无笔记</div>
                )}
                {items.map(note => (
                  <div key={note.id} className="kanban-card">
                    <button
                      className="kanban-card-title"
                      title="点开笔记"
                      onClick={() => onOpenNote(note.id)}
                    >
                      {note.title || '未命名'}
                    </button>
                    <div className="kanban-card-actions">
                      <button
                        className="kanban-move"
                        title="移到上一列(待办方向)"
                        disabled={colIdx === 0}
                        onClick={() => move(note, -1)}
                      >
                        <StrokeIcon name="chevron_left" size={14} />
                      </button>
                      <button
                        className="kanban-move"
                        title="移到下一列(完成方向)"
                        disabled={colIdx === KANBAN_STATUSES.length - 1}
                        onClick={() => move(note, 1)}
                      >
                        <StrokeIcon name="chevron_right" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="kanban-hint">
        点卡片标题打开笔记;用卡片上的左右按钮在列间流转状态(状态存于笔记 frontmatter)。拖拽排序留后续。
      </p>
    </div>
  );
}