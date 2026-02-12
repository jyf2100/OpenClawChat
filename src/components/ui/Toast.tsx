import React from 'react';
import { useToastStore, ToastType } from '../../stores/toastStore';
import './Toast.css';

const ToastIcon: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export const Toast: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role="alert"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="toast-icon">{ToastIcon[toast.type]}</div>
          <div className="toast-content">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
          </div>
          <button
            className="toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="关闭通知"
          >
            ✕
          </button>
          {!toast.persistent && (
            <div
              className="toast-progress"
              style={{
                animation: `toast-progress ${toast.duration || 4000}ms linear`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default Toast;
