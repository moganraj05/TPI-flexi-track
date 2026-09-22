import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { theme, SUCCESS, DANGER, INFO } from '../theme';

const ToastContext = createContext(null);

const VARIANT_STYLE = {
  neutral: {},
  success: { background: SUCCESS },
  error: { background: DANGER },
  info: { background: INFO },
};

let nextId = 0;

export function ToastProvider({ children }) {
  // A small stack (max 3) instead of a single message — a second toast used
  // to silently replace the first before either was read. `variant` is an
  // optional second argument so every existing `toast('message')` call site
  // keeps working unchanged and renders exactly as before (the 'neutral'
  // variant matches the old fixed dark-pill look).
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id) => {
      // Play the exit animation before unmounting instead of disappearing
      // instantly.
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => remove(id), 180);
    },
    [remove]
  );

  const toast = useCallback(
    (message, variant = 'neutral') => {
      const id = ++nextId;
      setToasts((prev) => [...prev.slice(-2), { id, message, variant, exiting: false }]);
      timers.current[id] = setTimeout(() => dismiss(id), 2500);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={theme.toastStack}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={t.exiting ? 'ft-toast-exit' : 'ft-toast'}
            style={{ ...theme.toast, position: 'static', ...VARIANT_STYLE[t.variant] }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
