/**
 * [M10③ 右 dock 模块独立] 大纲面板 —— 单内容组件
 *
 * 后续不用 RightPanel 多 tab 组件,而是每个右 dock 模块独立渲染本组件。
 * PaneWorkspace 已为单面板行提供 pane-header(标题 + 关闭),故这里只渲染大纲正文。
 */
import { StrokeIcon } from '../icons';
import './right-panes.css';

interface OutlinePaneProps {
  /** 当前笔记的 markdown 原文(用于抽取标题) */
  content: string;
  /** 点击某级标题 → 交由 App 决定行为(目前为占位,不跳转) */
  onHeadingClick?: (heading: string, level: number) => void;
}

/** 抽取全文标题:(#, ##, ... 六级) */
function extractHeadings(text: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) headings.push({ level: match[1].length, text: match[2] });
  }
  return headings;
}

export function OutlinePane({ content = '', onHeadingClick }: OutlinePaneProps) {
  const headings = extractHeadings(content);

  return (
    <div className="outline">
      {headings.length === 0 && (
        <p className="outline-empty">暂无标题大纲</p>
      )}
      {headings.map((h, i) => (
        <div
          key={i}
          className={`outline-item outline-level-${h.level}`}
          onClick={() => onHeadingClick?.(h.text, h.level)}
          style={{ paddingLeft: `${(h.level - 1) * 16}px` }}
        >
          <StrokeIcon name="outline" size={13} />
          <span>{h.text}</span>
        </div>
      ))}
    </div>
  );
}