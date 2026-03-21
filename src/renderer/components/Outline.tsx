import { useMemo } from 'react';
import type { SidebarButton } from './Sidebar';
import './Outline.css';

const ICON_PATHS: Record<string, string> = {
  outline: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  backlinks: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  git: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
  publish: 'M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.41 0 8-3.59 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.41 0-8 3.59-8 8H1l4 4 4-4H6z',
};

interface OutlineProps {
  content: string;
  onHeadingClick?: (heading: string, level: number) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  buttons?: SidebarButton[];
  onButtonClick?: (buttonId: string) => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function Outline({ content, onHeadingClick, isCollapsed, onToggle, buttons = [], onButtonClick }: OutlineProps) {
  const headings = useMemo(() => {
    const result: HeadingItem[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        result.push({ id, text, level });
      }
    }
    
    return result;
  }, [content]);

  return (
    <aside className={`outline-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="outline-header">
        <button className="outline-toggle" onClick={onToggle} title={isCollapsed ? '展开' : '收起'}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            {isCollapsed ? (
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            ) : (
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
            )}
          </svg>
        </button>
        <h3>大纲</h3>
        <span className="outline-count">{headings.length}</span>
      </div>

      {buttons.length > 0 && (
        <div className="outline-buttons">
          {buttons.filter(b => b.visible).map((button) => (
            <button
              key={button.id}
              className="outline-btn"
              onClick={() => onButtonClick?.(button.id)}
              title={button.label}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d={ICON_PATHS[button.icon] || ICON_PATHS.outline} />
              </svg>
              <span className="outline-btn-label">{button.label}</span>
            </button>
          ))}
        </div>
      )}
      
      {!isCollapsed && (
        <nav className="outline-content">
          {headings.length === 0 ? (
            <div className="outline-empty">
              <p>暂无标题</p>
            </div>
          ) : (
            headings.map((heading, index) => (
              <button
                key={`${heading.id}-${index}`}
                className={`outline-item outline-level-${heading.level}`}
                onClick={() => onHeadingClick?.(heading.text, heading.level)}
              >
                {heading.text}
              </button>
            ))
          )}
        </nav>
      )}
    </aside>
  );
}
