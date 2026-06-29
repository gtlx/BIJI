import { useState } from 'react';
import './Toast.css';

interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type || 'info'}`} onClick={() => onRemove(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
