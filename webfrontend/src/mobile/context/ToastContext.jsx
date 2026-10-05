import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

// Floating confirmation pill above the tab bar — `toast(title, subtitle?)`,
// same call shape as the Expo app's toast. `variant: 'error'` for failures.
const ToastContext = createContext(null);

export function MobileToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const nextId = useRef(0);

  const show = useCallback((title, subtitle, { variant = 'success' } = {}) => {
    clearTimeout(timer.current);
    nextId.current += 1;
    setToast({ id: nextId.current, title, subtitle, variant });
    timer.current = setTimeout(() => setToast(null), variant === 'error' ? 4000 : 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="m-toast-region" role="status" aria-live="polite">
        {toast ? (
          <div key={toast.id} className={`m-toast m-toast-${toast.variant}`}>
            <span className="m-toast-icon">
              <Icon name={toast.variant === 'error' ? 'alert' : 'check'} size={16} />
            </span>
            <span className="m-toast-text">
              <span className="m-toast-title">{toast.title}</span>
              {toast.subtitle ? <span className="m-toast-sub">{toast.subtitle}</span> : null}
            </span>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useMobileToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useMobileToast must be used within MobileToastProvider');
  return ctx;
}
