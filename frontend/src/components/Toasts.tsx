import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastsContextValue {
  pushToast: (message: string, kind?: ToastKind) => void;
}

const ToastsContext = createContext<ToastsContextValue | null>(null);

export function useToasts(): ToastsContextValue {
  const context = useContext(ToastsContext);
  if (!context) {
    throw new Error('useToasts must be used within a ToastsProvider');
  }
  return context;
}

export function ToastsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((previous) => [...previous, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  return (
    <ToastsContext.Provider value={{ pushToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastsContext.Provider>
  );
}
