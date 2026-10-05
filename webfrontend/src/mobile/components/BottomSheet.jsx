import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Slide-up sheet used for forms and confirmations (the Expo app's
// BottomSheet). Closes on the backdrop or Escape, keeps keyboard focus
// inside while open, and gives focus back to whatever opened it.
export function BottomSheet({ open, onClose, children, labelledBy, dismissable = true }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, a[href]') || []);
    // Focus the first form field if there is one, otherwise the panel itself.
    (panel?.querySelector('input:not([disabled]), select') || panel)?.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, dismissable]);

  if (!open) return null;

  return createPortal(
    <div className="m-root-portal">
      <div className="m-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose?.()}>
        <div ref={panelRef} className="m-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
          <div className="m-sheet-grabber" aria-hidden="true" />
          {children}
        </div>
      </div>
    </div>,
    document.querySelector('.m-root') || document.body
  );
}
