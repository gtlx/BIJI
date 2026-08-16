import { useState } from 'react';
import { StrokeIcon } from '../icons';
import { PomodoroTimer } from './PomodoroTimer';
import './RightPanel.css';

interface RightPanelProps {
  content: string;
  onHeadingClick: (heading: string, level: number) => void;
  onToggle: () => void;
  onPropertiesClick: () => void;
  /** 初始激活标签(由 App 控制,如番茄钟插件打开时) */
  defaultTab?: 'outline' | 'properties' | 'pomodoro';
  /** 是否显示番茄钟标签(内置插件启用时) */
  pomodoroEnabled?: boolean;
}

export function RightPanel({
  content, onHeadingClick, onToggle, onPropertiesClick,
  defaultTab = 'outline', pomodoroEnabled = false,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

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
        {pomodoroEnabled && (
          <button className={`tab ${activeTab === 'pomodoro' ? 'active' : ''}`} onClick={() => setActiveTab('pomodoro')}>番茄钟</button>
        )}
      </div>
      <div className="right-panel-content">
        {activeTab === 'outline' && (
          <div className="outline">
            {headings.length === 0 && <p className="outline-empty">暂无标题大纲</p>}
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
            <p className="properties-empty">笔记属性</p>
          </div>
        )}
        {activeTab === 'pomodoro' && (
          <div className="right-panel-pomodoro">
            <PomodoroTimer />
          </div>
        )}
      </div>
      <button className="right-panel-close" onClick={onToggle} title="关闭大纲">
        <StrokeIcon name="close" size={16} />
      </button>
    </div>
  );
}
