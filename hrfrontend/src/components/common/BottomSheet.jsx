import { useEffect } from 'react';
import { Icon } from './Icon';

export function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.handle} />
        <div style={styles.header}>
          <h3 style={styles.title}>{title}</h3>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(18, 24, 38, 0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 50,
  },
  sheet: {
    width: '100%',
    maxWidth: 'var(--shell-max-width)',
    maxHeight: '85vh',
    overflowY: 'auto',
    background: 'var(--white)',
    borderTopLeftRadius: 'var(--radius-sheet)',
    borderTopRightRadius: 'var(--radius-sheet)',
    padding: '10px 20px 28px',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    background: 'var(--line)',
    margin: '4px auto 12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
  },
  closeBtn: {
    border: 'none',
    background: 'var(--surface)',
    borderRadius: 10,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--ink-soft)',
  },
  body: {
    paddingBottom: 4,
  },
};
