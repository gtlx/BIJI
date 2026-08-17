import { useState } from 'react';
import type { Note, TrashBlock } from '../api/backend';
import { StrokeIcon } from '../icons';
import './TrashView.css';

interface TrashViewProps {
  trashNotes: Note[];
  trashBlocks: TrashBlock[];
  onRestoreNote: (id: string) => void;
  onDeleteNoteForever: (id: string) => void;
  onRestoreBlock: (id: string) => void;
  onDeleteBlockForever: (id: string) => void;
  onEmptyTrash: () => void;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
}

function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** [M3.5b 回收站] 展示软删的笔记与块,支持恢复 / 彻底删除 / 清空 */
export function TrashView({
  trashNotes, trashBlocks,
  onRestoreNote, onDeleteNoteForever,
  onRestoreBlock, onDeleteBlockForever,
  onEmptyTrash, onClose, onOpenNote,
}: TrashViewProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const total = trashNotes.length + trashBlocks.length;

  return (
    <div className="trash-view">
      <div className="trash-header">
        <div className="trash-title">
          <StrokeIcon name="trash" size={20} />
          <h2>回收站</h2>
          <span className="trash-count">{total} 项</span>
        </div>
        <div className="trash-actions">
          {total > 0 && (
            confirmClear
              ? (
                <span className="trash-confirm">
                  确定清空全部?
                  <button className="btn danger" onClick={onEmptyTrash}>确认</button>
                  <button className="btn" onClick={() => setConfirmClear(false)}>取消</button>
                </span>
              )
              : (
                <button className="btn" onClick={() => setConfirmClear(true)}>
                  <StrokeIcon name="trash" size={15} /> 清空回收站
                </button>
              )
          )}
          <button className="btn ghost" onClick={onClose}>返回笔记</button>
        </div>
      </div>

      {total === 0 ? (
        <div className="trash-empty">
          <StrokeIcon name="trash" size={40} />
          <p>回收站是空的</p>
        </div>
      ) : (
        <div className="trash-body">
          {/* 已删除的笔记 */}
          {trashNotes.length > 0 && (
            <>
              <h3 className="trash-section">已删除的笔记</h3>
              <ul className="trash-list">
                {trashNotes.map(n => (
                  <li key={n.id} className="trash-item" onClick={() => onOpenNote(n.id)}>
                    <div className="trash-item-main">
                      <span className="trash-item-title">{n.title || '无标题'}</span>
                      <span className="trash-item-meta">删除于 {fmtTime(n.deleted_at || 0)}</span>
                    </div>
                    <div className="trash-item-ops">
                      <button
                        className="icon-btn" title="恢复"
                        onClick={(e) => { e.stopPropagation(); onRestoreNote(n.id); }}
                      >
                        <StrokeIcon name="restore" size={16} />
                      </button>
                      <button
                        className="icon-btn danger" title="彻底删除"
                        onClick={(e) => { e.stopPropagation(); onDeleteNoteForever(n.id); }}
                      >
                        <StrokeIcon name="close" size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* 已删除的块(原笔记未删) */}
          {trashBlocks.length > 0 && (
            <>
              <h3 className="trash-section">已删除的内容片段</h3>
              <ul className="trash-list">
                {trashBlocks.map(b => (
                  <li key={b.id} className="trash-item" onClick={() => onOpenNote(b.note_id)}>
                    <div className="trash-item-main">
                      <span className="trash-item-title">{b.content.slice(0, 60)}{b.content.length > 60 ? '…' : ''}</span>
                      <span className="trash-item-meta">来自《{b.note_title}》· 删除于 {fmtTime(b.deleted_at)}</span>
                    </div>
                    <div className="trash-item-ops">
                      <button
                        className="icon-btn" title="恢复到原文"
                        onClick={(e) => { e.stopPropagation(); onRestoreBlock(b.id); }}
                      >
                        <StrokeIcon name="restore" size={16} />
                      </button>
                      <button
                        className="icon-btn danger" title="彻底删除"
                        onClick={(e) => { e.stopPropagation(); onDeleteBlockForever(b.id); }}
                      >
                        <StrokeIcon name="close" size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
