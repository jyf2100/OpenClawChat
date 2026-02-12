import { useToastStore as _useToastStore } from '../../stores/toastStore';
export { Toast as ToastComponent } from './Toast';
export { useToastStore as _useToastStore } from '../../stores/toastStore';
export type { Toast, ToastType } from '../../stores/toastStore';

// Convenience hook for showing toasts
export const useToast = () => {
  const { addToast, removeToast, clearAll } = _useToastStore();

  return {
    showToast: addToast,
    hideToast: removeToast,
    clearAllToasts: clearAll,
    success: (message: string, title?: string, duration?: number) =>
      addToast({ type: 'success', message, title, duration }),
    error: (message: string, title?: string, duration?: number) =>
      addToast({ type: 'error', message, title, duration }),
    warning: (message: string, title?: string, duration?: number) =>
      addToast({ type: 'warning', message, title, duration }),
    info: (message: string, title?: string, duration?: number) =>
      addToast({ type: 'info', message, title, duration }),
  };
};
