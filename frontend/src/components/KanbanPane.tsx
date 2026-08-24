/**
 * [M11 看板] 看板分栏面板 —— 把笔记按状态分列展示/流转(克制版,按钮式,无拖拽库)
 *
 * - 三列:待办 → 进行中 → 已完成(状态承载于笔记 content 顶部 frontmatter 的 `status:`,
 *   通过 utils/frontmatter.ts 读写,不进块,不破坏块级存储);
 * - 【新建卡片】列头 + 按钮 = 新建一条带该列 status 的笔记(复用 App 保存管线,新建即落库);
 * - 【改标题】点卡片上的铅笔进入行内编辑,Enter/失焦提交(改笔记标题,复用编辑/保存流程);
 * - 【列内排序】卡片上的上/下按钮在列内移动顺序 —— 用 localStorage 记忆列内顺序,
 *   不引第三方拖拽库;左右按钮仍在列间流转状态;
 * - 点开笔记(打开编辑器)、状态流转通过 prop 回调交给 App 持久化(backend.saveNote + notes 同步)。
 */
import { useEffect, useRef, useState } from 'react';
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

/** localStorage 键:记录「每列内已排序的笔记 id 顺序」(新笔记未记录则追加列尾) */
const ORDER_KEY = 'biji.kanban.column-order';

/** 读取列内排序记忆(JSON 容错,解析失败按空) */
function loadOrder(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface KanbanPaneProps {
  notes: Note[];
  /** 把某篇笔记流转到某列(持久化由 App 负责) */
  onSetStatus: (note: Note, status: string) => void;
  /** 点开某篇笔记(打开编辑器) */
  onOpenNote: (noteId: string) => void;
  /** 在指定列新建一张卡片(= 新建一条带该 status 的笔记,由 App 保存) */
  onNewCard: (status: string) => void;
  /** 重命名卡片标题(改笔记标题,由 App 保存) */
  onRename: (note: Note, title: string) => void;
}

/** 归一化状态:未知状态一律落到「待办」 */
function normalize(status: string): string {
  return KANBAN_STATUSES.includes(status as KanbanStatus) ? status : '待办';
}

export function KanbanPane({ notes, onSetStatus, onOpenNote, onNewCard, onRename }: KanbanPaneProps) {
  // 列内排序记忆:status → 有序 noteId 数组
  const [order, setOrder] = useState<Record<string, string[]>>(loadOrder);
  // 正在行内编辑标题的卡片 id(单卡同时只编辑一个)
  const [editingId, setEditingId] = useState<string | null>(null);
  // 行内编辑的草稿标题
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 排序记忆变更即落 localStorage(重启还原)
  useEffect(() => {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* 隐私模式静默 */ }
  }, [order]);

  // 进入编辑时自动聚焦并全选,方便直接覆写标题
  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const live = notes.filter(n => !n.deleted_at);
  const colOf = (n: Note) => normalize(getNoteKanbanStatus(n.content));

  /** 一列当前有效卡片的展示顺序:先按本地记忆里该列的排序,未记忆/新增的按 notes 原序追加列尾 */
  const effectiveIds = (status: string, candidates: Note[]): string[] => {
    const remembered = order[status] ?? [];
    const included = new Set<string>();
    const out: string[] = [];
    remembered.forEach(id => {
      if (!included.has(id) && candidates.some(n => n.id === id)) {
        included.add(id);
        out.push(id);
      }
    });
    candidates.forEach(n => {
      if (!included.has(n.id)) {
        included.add(n.id);
        out.push(n.id);
      }
    });
    return out;
  };

  /** 在列间流转状态(待办 → 进行中 → 已完成) */
  const move = (note: Note, dir: -1 | 1) => {
    const cur = KANBAN_STATUSES.indexOf(normalize(getNoteKanbanStatus(note.content)) as KanbanStatus);
    const nextIdx = cur + dir;
    if (nextIdx < 0 || nextIdx >= KANBAN_STATUSES.length) return;
    onSetStatus(note, KANBAN_STATUSES[nextIdx]);
  };

  /** 在列内上下移动顺序(按钮式排序,无拖拽) */
  const moveWithin = (status: string, note: Note, dir: -1 | 1) => {
    const candidates = live.filter(n => colOf(n) === status);
    const ids = effectiveIds(status, candidates);
    const i = ids.indexOf(note.id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(prev => ({ ...prev, [status]: next }));
  };

  const startEdit = (note: Note) => {
    setDraft(note.title || '');
    setEditingId(note.id);
  };
  const commitEdit = (note: Note) => {
    const title = draft.trim();
    if (title && title !== note.title) onRename(note, title);
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  return (
    <div className="kanban-pane">
      <div className="kanban-columns">
        {COLUMNS.map(col => {
          const candidates = live.filter(n => colOf(n) === col.label);
          const ids = effectiveIds(col.label, candidates);
          const byId = new Map<string, Note>(candidates.map((n): [string, Note] => [n.id, n]));
          const items = ids.map(id => byId.get(id)).filter((n): n is Note => !!n);
          const colIdx = KANBAN_STATUSES.indexOf(col.label as KanbanStatus);
          return (
            <div key={col.id} className={`kanban-column kanban-col-${col.id}`}>
              <div className="kanban-col-head">
                <span className="kanban-col-dot" />
                <span className="kanban-col-title">{col.label}</span>
                <span className="kanban-col-count">{items.length}</span>
                <button
                  className="kanban-add-card"
                  title={`在「${col.label}」新建卡片`}
                  onClick={() => onNewCard(col.label)}
                >
                  <StrokeIcon name="plus" size={14} />
                </button>
              </div>
              <div className="kanban-col-body">
                {items.length === 0 && (
                  <div className="kanban-col-empty">无笔记</div>
                )}
                {items.map((note, idx) => (
                  <div key={note.id} className="kanban-card">
                    <div className="kanban-card-top">
                      {editingId === note.id ? (
                        <input
                          ref={inputRef}
                          className="kanban-card-edit"
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onBlur={() => commitEdit(note)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(note); }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                          }}
                        />
                      ) : (
                        <>
                          <button
                            className="kanban-card-title"
                            title="点开笔记"
                            onClick={() => onOpenNote(note.id)}
                          >
                            {note.title || '未命名'}
                          </button>
                          <button
                            className="kanban-edit-btn"
                            title="重命名卡片"
                            onClick={() => startEdit(note)}
                          >
                            <StrokeIcon name="edit" size={13} />
                          </button>
                        </>
                      )}
                    </div>
                    <div className="kanban-card-actions">
                      <button
                        className="kanban-move"
                        title="列内上移"
                        disabled={idx === 0}
                        onClick={() => moveWithin(col.label, note, -1)}
                      >
                        <StrokeIcon name="chevron_up" size={14} />
                      </button>
                      <button
                        className="kanban-move"
                        title="列内下移"
                        disabled={idx === items.length - 1}
                        onClick={() => moveWithin(col.label, note, 1)}
                      >
                        <StrokeIcon name="chevron_down" size={14} />
                      </button>
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
        点标题打开笔记,点铅笔改标题;卡片上的上下按钮做列内排序,左右按钮在列间流转状态(状态存于笔记 frontmatter)。
      </p>
    </div>
  );
}