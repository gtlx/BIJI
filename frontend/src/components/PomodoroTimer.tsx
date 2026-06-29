import { useState, useEffect } from 'react';
import './PomodoroTimer.css';

export function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
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
            setTimeLeft(5 * 60);
          } else {
            setMode('work');
            setTimeLeft(25 * 60);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, mode]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const toggle = () => {
    if (timeLeft === 0) {
      setTimeLeft(25 * 60);
      setMode('work');
    }
    setIsRunning(!isRunning);
  };

  const reset = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  return (
    <div className="pomodoro-timer">
      <h4>番茄钟</h4>
      <div className="pomodoro-mode">{mode === 'work' ? '专注' : '休息'}</div>
      <div className="pomodoro-time">{formatTime(timeLeft)}</div>
      <div className="pomodoro-controls">
        <button onClick={toggle}>{isRunning ? '暂停' : '开始'}</button>
        <button onClick={reset}>重置</button>
      </div>
    </div>
  );
}
