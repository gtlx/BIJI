import { StrokeIcon } from '../icons';
import './NoteTabs.css';

/**
 * [渐进多标签] 顶部/左侧「打开历史笔记」标签条
 *
 * 说明:这是「视图层的打开历史记录」,不是「真·多篇并行编辑」。
 * 数据模型不变:selectedNote 仍单篇驱动核心(块级存储/发布/双链等均不因标签改变)。
 *
 * 数据结构刻意设计为「笔记 id 数组 + 活动 id」:
 *   { ids: string[], activeId: string | null }
 * 便于将来平滑升级为「真·多标签(多篇并行)」时复用同一底座。
 *
 * 位置偏好可切换:
 *   - top  : 默认,顶部横排标签条(浏览器/编辑器顶栏习惯)
 *   - left : 左侧竖排标签条(类似 Obsidian 侧边标签)
 * 仅桌面工作区渲染(移动端保持单栏,不挤占)。
 */

export type NoteTabPosition = 'top' | 'left';

interface NoteTabsProps {
  /** 打开历史笔记 id 列表(去重,保留打开顺序) */
  ids: string[];
  /** 当前活动笔记 id(高亮) */
  activeId: string | null;
  /** 由父级按 id 解析标题(未知名回退文案) */
  getTitle: (id: string) => string;
  /** 排列位置:顶部横排 / 左侧竖排 */
  position: NoteTabPosition;
  /** 点某标签 → 跳到该笔记 */
  onSelect: (id: string) => void;
  /** 关闭某标签(X) */
  onClose: (id: string) => void;
  /** 切换标签排列位置(顶部 ⇄ 左侧) */
  onTogglePosition: () => void;
}

/** 内联 SVG(禁 emoji):布局切换图标。target=切换后目标位置 */
function LayoutSwitchIcon({ target }: { target: NoteTabPosition }) {
  const common = {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none' as const,
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const,
  };
  return (
    <svg {...common}>
      {target === 'left' ? (
        /* 画「左侧竖排标签」:左列三短线 + 右侧大内容块 */
        <>
          <path d="M4 8h4M4 12h4M4 16h4" />
          <rect x="11" y="3" width="10" height="18" rx="1.5" />
        </>
      ) : (
        /* 画「顶部横排标签」:顶部横条 + 下方正文区 */
        <>
          <rect x="3" y="3" width="18" height="5" rx="1.5" />
          <path d="M3 13h9M3 17h9M3 21h9" />
        </>
      )}
    </svg>
  );
}

export function NoteTabs({ ids, activeId, getTitle, position, onSelect, onClose, onTogglePosition }: NoteTabsProps) {
  return (
    <div className={`note-tabs note-tabs-${position}`} role="tablist" aria-label="打开笔记历史">
      {ids.length === 0 ? (
        /* 空态:尚未打开任何笔记 */
        <span className="note-tabs-empty">打开笔记后,会话历史标签将显示在这里</span>
      ) : (
        <>
          {ids.map(id => {
            const active = id === activeId;
            const title = getTitle(id) || '未命名';
            return (
              <div
                key={id}
                className={`note-tab ${active ? 'active' : ''}`}
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(id)}
                title={title}
              >
                <StrokeIcon name="notes" size={12} />
                <span className="note-tab-title">{title}</span>
                <button
                  className="note-tab-close"
                  title={`关闭标签 ${title}`}
                  aria-label={`关闭 ${title}`}
                  onClick={(e) => { e.stopPropagation(); onClose(id); }}
                >
                  <StrokeIcon name="close" size={12} />
                </button>
              </div>
            );
          })}
        </>
      )}
      {/* 显示偏好:切换顶部/左侧 */}
      <button
        className="note-tabs-toggle"
        title={position === 'top' ? '切换为左侧竖排标签' : '切换为顶部横排标签'}
        aria-label="切换标签排列位置"
        onClick={onTogglePosition}
      >
        <LayoutSwitchIcon target={position === 'top' ? 'left' : 'top'} />
      </button>
    </div>
  );
}