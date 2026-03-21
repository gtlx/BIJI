import { useMemo } from 'react';
import './Outline.css';

interface OutlineProps {
  content: string;
  onHeadingClick?: (heading: string, level: number) => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function Outline({ content, onHeadingClick }: OutlineProps) {
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

  if (headings.length === 0) {
    return (
      <aside className="outline-sidebar">
        <div className="outline-header">
          <h3>大纲</h3>
        </div>
        <div className="outline-empty">
          <p>暂无标题</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="outline-sidebar">
      <div className="outline-header">
        <h3>大纲</h3>
        <span className="outline-count">{headings.length}</span>
      </div>
      <nav className="outline-content">
        {headings.map((heading, index) => (
          <button
            key={`${heading.id}-${index}`}
            className={`outline-item outline-level-${heading.level}`}
            onClick={() => onHeadingClick?.(heading.text, heading.level)}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </aside>
  );
}