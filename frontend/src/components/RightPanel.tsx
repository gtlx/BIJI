import { useState } from 'react';
import './RightPanel.css';

interface RightPanelProps {
  content: string;
  onHeadingClick: (heading: string, level: number) => void;
  onToggle: () => void;
  onPropertiesClick: () => void;
}

export function RightPanel({ content, onHeadingClick, onToggle, onPropertiesClick }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState('outline');

  const extractHeadings = (text: string) => {
    const headings: { level: number; text: string }[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) headings.push({ level: match[1].length, text: match[2] });
    }
    return headings;
  };

  const headings = extractHeadings(content);

  return (
    <div className="right-panel">
      <div className="right-panel-tabs">
        <button className={`tab ${activeTab === 'outline' ? 'active' : ''}`} onClick={() => setActiveTab('outline')}>大纲</button>
        <button className={`tab ${activeTab === 'properties' ? 'active' : ''}`} onClick={() => { setActiveTab('properties'); onPropertiesClick(); }}>属性</button>
      </div>
      <div className="right-panel-content">
        {activeTab === 'outline' && (
          <div className="outline">
            {headings.map((h, i) => (
              <div key={i} className={`outline-item level-${h.level}`} onClick={() => onHeadingClick(h.text, h.level)}
                style={{ paddingLeft: `${(h.level - 1) * 16}px` }}>
                {h.text}
              </div>
            ))}
          </div>
        )}
        {activeTab === 'properties' && (
          <div className="properties-panel">
            <p>笔记属性</p>
          </div>
        )}
      </div>
      <button className="right-panel-close" onClick={onToggle}>×</button>
    </div>
  );
}
