/**
 * [M10③ 右 dock 模块独立] 反向链接面板 —— 单内容组件
 *
 * 只负责展示「当前笔记被哪些块引用」,不再与大纲/属性/番茄钟共享 tab。
 * PaneWorkspace 已提供面板标题 + 关闭,这里只渲染反向链接正文。
 */
import { useEffect, useState } from 'react';
import { backend } from '../api';
import type { BlockBacklink } from '../api/backend';
import { StrokeIcon } from '../icons';
import './right-panes.css';

interface BacklinksPaneProps {
  /** 当前笔记 id(为空则反向链接为空态) */
  noteId?: string | null;
  /** 点击一条反向链接 → 跳转到来源笔记 */
  onSelectNote?: (note: { id: string; title: string }) => void;
}

/** 时间戳 → 本地化展示(月/日 时:分) */
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 去掉引用标记([]、*、_、`、~)后的纯文本片段 */
const snippet = (content: string) => content.replace(/[#*_`~[\]]/g, '').trim();

export function BacklinksPane({ noteId = null, onSelectNote }: BacklinksPaneProps) {
  const [backlinks, setBacklinks] = useState<BlockBacklink[]>([]);
  const [blLoading, setBlLoading] = useState(false);

  // 笔记切换时重新拉取反向链接
  useEffect(() => {
    let cancelled = false;
    if (!noteId) return;
    setBlLoading(true);
    backend
      .getBlockBacklinks(noteId)
      .then(data => { if (!cancelled) setBacklinks(data); })
      .catch(() => { if (!cancelled) setBacklinks([]); })
      .finally(() => { if (!cancelled) setBlLoading(false); });
    return () => { cancelled = true; };
  }, [noteId]);

  return (
    <div className="backlinks-panel">
      {blLoading ? (
        <p className="backlinks-empty">加载中...</p>
      ) : backlinks.length === 0 ? (
        <p className="backlinks-empty">暂无反向链接</p>
      ) : (
        <ul className="backlinks-list">
          {backlinks.map(bl => (
            <li key={bl.block_id} className="backlinks-item">
              <button className="backlinks-source" onClick={() => onSelectNote?.({ id: bl.source_note_id, title: bl.source_note_title })}>
                <StrokeIcon name="backlink" size={13} />
                {bl.source_note_title || '未命名笔记'}
                <span className="backlinks-time">{fmtTime(bl.updated_at)}</span>
              </button>
              <p className="backlinks-snippet">{snippet(bl.content) || '（空块）'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}