import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { theme, DANGER } from '../../theme';
import { initials } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABELS = { hr: 'HR', admin: 'Admin', superadmin: 'Super admin' };

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const Chevron = ({ open }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ transition: 'transform 150ms ease-out', transform: open ? 'rotate(180deg)' : 'none' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Top-right account menu: avatar trigger → dropdown with the signed-in
// user's identity, a Settings shortcut and Log out. Closes on outside click,
// Escape, or navigation.
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const goSettings = () => {
    setOpen(false);
    navigate('/app/settings');
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || '';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className="ft-usermenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 10px 4px 4px',
          borderRadius: 999,
          border: `1px solid ${open ? theme.accent : theme.borderColor}`,
          background: open ? theme.bg + '66' : theme.surface,
          color: theme.textPrimary,
          fontFamily: theme.font,
        }}
      >
        <span style={theme.avatar}>{initials(user?.name)}</span>
        <span className="ft-usermenu-name" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2, maxWidth: 160 }}>
          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{user?.name}</span>
          {roleLabel && <span style={{ fontSize: 11, fontWeight: 600, color: theme.textSecondary }}>{roleLabel}</span>}
        </span>
        <span style={{ color: theme.textSecondary, display: 'flex' }}>
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="ft-usermenu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 260,
            background: theme.surface,
            border: `1px solid ${theme.borderColor}`,
            borderRadius: 12,
            boxShadow: '0 12px 32px -8px rgba(8,14,17,0.22), 0 2px 6px rgba(8,14,17,0.06)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${theme.borderColor}` }}>
            <span style={{ ...theme.avatar, width: 40, height: 40, fontSize: 13 }}>{initials(user?.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ fontSize: 12, color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user?.email}>
                {user?.email}
              </div>
            </div>
          </div>

          <div style={{ padding: 6 }}>
            <MenuItem icon={<SettingsIcon />} label="Settings" onClick={goSettings} />
          </div>
          <div style={{ padding: 6, borderTop: `1px solid ${theme.borderColor}` }}>
            <MenuItem icon={<LogoutIcon />} label="Log out" onClick={handleLogout} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={danger ? 'ft-usermenu-item ft-usermenu-item-danger' : 'ft-usermenu-item'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 10px',
        border: 'none',
        borderRadius: 8,
        background: 'transparent',
        color: danger ? DANGER : theme.textPrimary,
        fontSize: 13.5,
        fontWeight: 600,
        fontFamily: theme.font,
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', color: danger ? DANGER : theme.textSecondary }}>{icon}</span>
      {label}
    </button>
  );
}
