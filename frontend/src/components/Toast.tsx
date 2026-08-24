import { useEffect } from 'react';
import './Toast.css';

/** Toast 出现位置(类名关键词,用于 .toast-pos-* 定位切换) */
export type ToastPosition = 'right-bottom' | 'right-top' | 'left-bottom' | 'left-top';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  /**
   * [通知] 自动消失时长(毫秒)。null / 0 / undefined = 常驻,需点击才关闭。
   * 由调用方(showToast)依据设置换算后传入。
   */
  durationMs?: number | null;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
  /** [通知] Toast 出现位置;缺省右下,与旧行为一致。 */
  position?: ToastPosition;
}

export function ToastContainer({ toasts, onRemove, position = 'right-bottom' }: ToastContainerProps) {
  // [通知] 自动消失:为每个设置了时长的 toast 启动倒计时;常驻(时长为空/0)则不设。
  // toasts 变化时重建定时器(已被移除的 toast 自动跳过)。
  useEffect(() => {
    const timers = toasts
      .filter(t => typeof t.durationMs === 'number' && t.durationMs > 0)
      .map(t => setTimeout(() => onRemove(t.id), t.durationMs as number));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onRemove]);

  return (
    <div className={`toast-container toast-pos-${position}`}>
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type || 'info'}`} onClick={() => onRemove(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}