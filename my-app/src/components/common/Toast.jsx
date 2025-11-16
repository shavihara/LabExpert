import React, { useEffect } from 'react';
import { create } from 'zustand';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// Toast Store
const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toast) => set((state) => ({
    toasts: [...state.toasts, { id: Date.now(), ...toast }]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(toast => toast.id !== id)
  })),
  clearToasts: () => set({ toasts: [] })
}));

// Toast Component
const Toast = ({ toast }) => {
  const { removeToast } = useToastStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, toast.duration || 5000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBackgroundColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className={`flex items-center p-4 mb-2 border rounded-lg shadow-sm ${getBackgroundColor()}`}>
      <div className="flex-shrink-0">
        {getIcon()}
      </div>
      <div className="ml-3 flex-1">
        {toast.title && (
          <h3 className="text-sm font-medium text-gray-900">{toast.title}</h3>
        )}
        {toast.message && (
          <p className="text-sm text-gray-700 mt-1">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// Toast Container
export const ToastContainer = () => {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

// Toast Hook
export const useToast = () => {
  const { addToast, removeToast, clearToasts } = useToastStore();

  const showToast = (type, message, title, duration) => {
    addToast({ type, message, title, duration });
  };

  return {
    showSuccess: (message, title, duration) => showToast('success', message, title, duration),
    showError: (message, title, duration) => showToast('error', message, title, duration),
    showWarning: (message, title, duration) => showToast('warning', message, title, duration),
    showInfo: (message, title, duration) => showToast('info', message, title, duration),
    removeToast,
    clearToasts
  };
};

export default Toast;