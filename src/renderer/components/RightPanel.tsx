import { useState, useMemo } from 'react';
import { BuiltInPomodoro } from '../plugins/BuiltInPomodoro';
import './RightPanel.css';

interface RightPanelProps {
  content: string;
  onHeadingClick?: (heading: string, level: number) => void;
  onToggle?: () => void;
  onPropertiesClick?: () => void;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

type RightPanelTab = 'properties' | 'pomodoro' | 'outline';

export function RightPanel({ 
  content, 
  onHeadingClick,
  onToggle,
  onPropertiesClick,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('outline');

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
    <aside className="right-panel">
      <div className="right-panel-header">
        <button className="right-panel-toggle" onClick={onToggle} title="收起">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </button>
      </div>

      <div className="right-panel-tabs">
        <button 
          className={`right-panel-tab ${activeTab === 'properties' ? 'active' : ''}`}
          title="属性"
          onClick={() => {
            setActiveTab('properties');
            onPropertiesClick?.();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
          </svg>
          <span>属性</span>
        </button>
        <button 
          className={`right-panel-tab ${activeTab === 'pomodoro' ? 'active' : ''}`}
          title="番茄钟"
          onClick={() => setActiveTab('pomodoro')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span>番茄钟</span>
        </button>
        <button 
          className={`right-panel-tab ${activeTab === 'outline' ? 'active' : ''}`}
          title="大纲"
          onClick={() => setActiveTab('outline')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
          <span>大纲</span>
        </button>
      </div>
      
      {activeTab === 'pomodoro' ? (
        <div className="right-panel-content">
          <BuiltInPomodoro compact />
        </div>
      ) : activeTab === 'outline' ? (
        <nav className="right-panel-content">
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
      ) : (
        <div className="right-panel-content">
          <p className="properties-empty">属性面板开发中</p>
        </div>
      )}
    </aside>
  );
}
