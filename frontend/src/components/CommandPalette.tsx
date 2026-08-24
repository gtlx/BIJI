/**
 * [全局快捷键] 命令搜索/命令面板(Ctrl/Cmd+P 打开)
 *
 * 列出可执行动作:新建笔记 / 新建日记 / 搜索 / 切换面板(大纲·图谱·日历·文件·反向链接)
 * / 开右栏 / 导出 .md·HTML / 打开设置 / 插入模板 / 切换主题 等。
 * 通用组件:父级传 actions 列表,键盘 ↑↓ 选择 + Enter 执行 + Esc 关闭。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StrokeIcon } from '../icons';
import './CommandPalette.css';

export interface CommandAction {
  id: string;
  label: string;
  icon: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  actions: CommandAction[];
  onClose: () => void;
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(a => a.label.toLowerCase().includes(q) || (a.hint || '').toLowerCase().includes(q));
  }, [actions, filter]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [filter]);

  // 滚动聚焦项进视野
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (a: CommandAction) => {
    a.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) run(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search">
          <StrokeIcon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="输入命令或搜索动作..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd className="cmd-kbd">Esc</kbd>
        </div>
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 ? (
            <p className="cmd-empty">无匹配动作</p>
          ) : (
            filtered.map((a, i) => (
              <button
                key={a.id}
                data-idx={i}
                className={`cmd-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(a)}
              >
                <span className="cmd-item-icon"><StrokeIcon name={a.icon} size={16} /></span>
                <span className="cmd-item-label">{a.label}</span>
                {a.hint && <kbd className="cmd-item-hint">{a.hint}</kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
