import { useEffect, useState } from 'react';
import { backend } from '../api';
import type { BlockBacklink } from '../api/backend';
import { StrokeIcon } from '../icons';
import { PomodoroTimer } from './PomodoroTimer';
import './RightPanel.css';

interface RightPanelProps {
  content: string;
  onHeadingClick: (heading: string, level: number) => void;
  onToggle: () => void;
  onPropertiesClick: () => void;
  /** 初始激活标签(由 App 控制,如番茄钟插件打开时) */
  defaultTab?: 'outline' | 'properties' | 'pomodoro' | 'backlinks';
  /** 是否显示番茄钟标签(内置插件启用时) */
  pomodoroEnabled?: boolean;
  /** [M3.5a 反向链接] 当前笔记 id(为空则反向链接面板为空态) */
  noteId?: string | null;
  /** [M3.5a 反向链接] 点击某条反向链接 → 跳转来源笔记 */
  onSelectNote?: (note: { id: string; title: string }) => void;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 去掉引用标记后的展示片段 */
const snippet = (content: string) => content.replace(/[#*_`~[\]]/g, '').trim();

export function RightPanel({
  content, onHeadingClick, onToggle, onPropertiesClick,
  defaultTab = 'outline', pomodoroEnabled = false, noteId = null, onSelectNote,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [backlinks, setBacklinks] = useState<BlockBacklink[]>([]);
  const [blLoading, setBlLoading] = useState(false);

  // 反向链接:笔记切换时拉取
  useEffect(() => {
    let cancelled = false;
    if (activeTab !== 'backlinks' || !noteId) return;
    setBlLoading(true);
    backend.getBlockBacklinks(noteId)
      .then(data => { if (!cancelled) setBacklinks(data); })
      .catch(() => { if (!cancelled) setBacklinks([]); })
      .finally(() => { if (!cancelled) setBlLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, noteId]);

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

  const goBacklink = (bl: BlockBacklink) => {
    onSelectNote?.({ id: bl.source_note_id, title: bl.source_note_title });
  };

  return (
    <div className="right-panel">
      <div className="right-panel-tabs">
        <button className={`tab ${activeTab === 'outline' ? 'active' : ''}`} onClick={() => setActiveTab('outline')}>大纲</button>
        <button className={`tab ${activeTab === 'backlinks' ? 'active' : ''}`} onClick={() => setActiveTab('backlinks')}>反向链接</button>
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
        {activeTab === 'backlinks' && (
          <div className="backlinks-panel">
            {blLoading ? (
              <p className="backlinks-empty">加载中...</p>
            ) : backlinks.length === 0 ? (
              <p className="backlinks-empty">暂无反向链接</p>
            ) : (
              <ul className="backlinks-list">
                {backlinks.map(bl => (
                  <li key={bl.block_id} className="backlinks-item">
                    <button className="backlinks-source" onClick={() => goBacklink(bl)}>
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
