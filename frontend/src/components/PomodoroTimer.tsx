import { useState, useEffect } from 'react';
import { StrokeIcon } from '../icons';
import './PomodoroTimer.css';

const WORK_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;

/** [Pane 番茄钟面板] 独立的番茄钟面板组件(可作分栏面板,也可作右栏 tab) */
export function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(WORK_SEC);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'work' | 'break'>('work');

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsRunning(false);
          if (mode === 'work') {
            setMode('break');
            setTimeLeft(BREAK_SEC);
          } else {
            setMode('work');
            setTimeLeft(WORK_SEC);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, mode]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const toggle = () => {
    if (timeLeft === 0) { setTimeLeft(WORK_SEC); setMode('work'); }
    setIsRunning(!isRunning);
  };

  const reset = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'work' ? WORK_SEC : BREAK_SEC);
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
