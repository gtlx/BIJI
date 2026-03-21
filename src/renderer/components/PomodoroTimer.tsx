import { useState, useEffect } from 'react';
import './PomodoroTimer.css';

interface PomodoroTimerProps {
  onClose: () => void;
}

type TimerMode = 'work' | 'shortBreak' | 'longBreak';

const TIMER_CONFIGS = {
  work: { duration: 25 * 60, label: '工作', color: '#e74c3c' },
  shortBreak: { duration: 5 * 60, label: '短休息', color: '#27ae60' },
  longBreak: { duration: 15 * 60, label: '长休息', color: '#3498db' },
};

const POMODORO_INTERVAL = 4;

export function PomodoroTimer({ onClose }: PomodoroTimerProps) {
  const [mode, setMode] = useState<TimerMode>('work');
  const [timeLeft, setTimeLeft] = useState(TIMER_CONFIGS.work.duration);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);

  const config = TIMER_CONFIGS[mode];

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      if (mode === 'work') {
        const newCompleted = completedPomodoros + 1;
        setCompletedPomodoros(newCompleted);
        
        if (newCompleted % POMODORO_INTERVAL === 0) {
          setMode('longBreak');
          setTimeLeft(TIMER_CONFIGS.longBreak.duration);
        } else {
          setMode('shortBreak');
          setTimeLeft(TIMER_CONFIGS.shortBreak.duration);
        }
      } else {
        setMode('work');
        setTimeLeft(TIMER_CONFIGS.work.duration);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft, mode, completedPomodoros]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(config.duration);
  };

  const handleModeChange = (newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(TIMER_CONFIGS[newMode].duration);
  };

  const progress = ((config.duration - timeLeft) / config.duration) * 100;

  return (
    <div className="pomodoro-overlay" onClick={onClose}>
      <div className="pomodoro-modal" onClick={e => e.stopPropagation()}>
        <div className="pomodoro-header">
          <h2>番茄钟</h2>
          <button className="pomodoro-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="pomodoro-modes">
          <button 
            className={`mode-btn ${mode === 'work' ? 'active' : ''}`}
            onClick={() => handleModeChange('work')}
            style={{ '--mode-color': TIMER_CONFIGS.work.color } as React.CSSProperties}
          >
            工作
          </button>
          <button 
            className={`mode-btn ${mode === 'shortBreak' ? 'active' : ''}`}
            onClick={() => handleModeChange('shortBreak')}
            style={{ '--mode-color': TIMER_CONFIGS.shortBreak.color } as React.CSSProperties}
          >
            短休息
          </button>
          <button 
            className={`mode-btn ${mode === 'longBreak' ? 'active' : ''}`}
            onClick={() => handleModeChange('longBreak')}
            style={{ '--mode-color': TIMER_CONFIGS.longBreak.color } as React.CSSProperties}
          >
            长休息
          </button>
        </div>

        <div className="pomodoro-timer">
          <svg className="timer-ring" viewBox="0 0 100 100">
            <circle
              className="timer-ring-bg"
              cx="50"
              cy="50"
              r="45"
            />
            <circle
              className="timer-ring-progress"
              cx="50"
              cy="50"
              r="45"
              style={{ 
                strokeDasharray: `${2 * Math.PI * 45}`,
                strokeDashoffset: `${2 * Math.PI * 45 * (1 - progress / 100)}`,
                stroke: config.color
              }}
            />
          </svg>
          <div className="timer-display" style={{ color: config.color }}>
            <span className="timer-time">{formatTime(timeLeft)}</span>
            <span className="timer-label">{config.label}</span>
          </div>
        </div>

        <div className="pomodoro-controls">
          {!isRunning ? (
            <button className="control-btn start" onClick={handleStart}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          ) : (
            <button className="control-btn pause" onClick={handlePause}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            </button>
          )}
          <button className="control-btn reset" onClick={handleReset}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>

        <div className="pomodoro-stats">
          <span className="stat-label">今日完成</span>
          <span className="stat-value">{completedPomodoros} 个番茄</span>
        </div>
      </div>
    </div>
  );
}
