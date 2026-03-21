import { useMemo } from 'react';
import './Outline.css';

interface OutlineProps {
  content: string;
  onHeadingClick?: (heading: string, level: number) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function Outline({ content, onHeadingClick, isCollapsed, onToggle }: OutlineProps) {
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
