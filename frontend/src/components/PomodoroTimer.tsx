import { useState, useEffect } from 'react';
import { StrokeIcon } from '../icons';
import type { AppSettings } from '../api/backend';
import './PomodoroTimer.css';

/** 默认专注/休息时长(分钟);可由设置覆盖 */
const DEFAULT_WORK_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

interface PomodoroTimerProps {
  /** [M11 收尾] 设置中的番茄钟时长/提醒;缺省用默认 25/5 分钟 */
  settings?: AppSettings | null;
}

/** [Pane 番茄钟面板] 独立的番茄钟面板组件(可作分栏面板,也可作右栏 tab) */
export function PomodoroTimer({ settings }: PomodoroTimerProps) {
  // 专注/休息时长(分钟 → 秒),跟随设置变化
  const workSec = (settings?.pomodoro_focus_minutes ?? DEFAULT_WORK_MIN) * 60;
  const breakSec = (settings?.pomodoro_break_minutes ?? DEFAULT_BREAK_MIN) * 60;
  const remind = settings?.pomodoro_reminder !== false; // 缺省提醒
  const [timeLeft, setTimeLeft] = useState(workSec);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'work' | 'break'>('work');

  // 完成一个番茄后可选提醒:系统通知 + 控制台提示(浏览器环境做 feature 检测)
  const notify = (msg: string) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('番茄钟', { body: msg }); } catch { /* 忽略 */ }
    }
    // 改变 document.title 闪烁,提醒回到窗口(简单版)
    const prev = document.title;
    document.title = msg;
    setTimeout(() => { document.title = prev; }, 3000);
  };

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsRunning(false);
          if (mode === 'work') {
            setMode('break');
            setTimeLeft(breakSec);
            if (remind) notify('休息一下!专注时段结束');
          } else {
            setMode('work');
            setTimeLeft(workSec);
            if (remind) notify('休息结束,开始下一个专注时段');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, mode, workSec, breakSec, remind]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const toggle = () => {
    if (timeLeft === 0) { setTimeLeft(workSec); setMode('work'); }
    setIsRunning(!isRunning);
  };

  const reset = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'work' ? workSec : breakSec);
  };

  const modeLabel = mode === 'work' ? '专注' : '休息';

  return (
    <div className={`pomodoro-timer ${mode === 'work' ? 'mod-work' : 'mod-break'}`}>
      <div className="pomodoro-head">
        <StrokeIcon name="timer" size={16} />
        <span>番茄钟</span>
        <span className="pomodoro-mode-chip">{modeLabel}</span>
      </div>
      <div className="pomodoro-clock">
        <span className="pomodoro-time">{formatTime(timeLeft)}</span>
        <span className="pomodoro-sub">{isRunning ? '进行中…' : modeLabel}</span>
      </div>
      <div className="pomodoro-controls">
        <button className={`pomodoro-btn ${isRunning ? 'pause' : 'start'}`} onClick={toggle}>
          <StrokeIcon name={isRunning ? 'close' : 'plus'} size={16} />
          {isRunning ? '暂停' : '开始'}
        </button>
        <button className="pomodoro-btn reset" onClick={reset} title="重置">
          <StrokeIcon name="restore" size={15} />
          重置
        </button>
      </div>
    </div>
  );
}
