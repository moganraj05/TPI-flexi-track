import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { theme, WARNING } from '../../theme';
import { useLiveStatus } from '../../context/LiveStatusContext';
import { UserMenu } from './UserMenu';
import { useOnline } from '../../hooks/useOnline';

const TITLES = {
  dashboard: 'Overview',
  live: 'Live Board',
  attendance: 'Attendance',
  workforce: 'Workforce',
  notifications: 'Notifications',
  audit: 'Audit log',
  'password-requests': 'Password requests',
  reports: 'Reports & Exports',
  settings: 'Settings',
};

function getScreenTitle(pathname) {
  const segments = pathname.replace(/^\/staff\/app\/?/, '').split('/').filter(Boolean);
  const [section, sub] = segments;
  if (section === 'workforce' && sub === 'worker') return 'Worker details';
  if (section === 'workforce' && sub === 'incharge') return 'Incharge details';
  return TITLES[section] || 'FlexiTrack';
}

export function Topbar({ compact = false, sidebarCollapsed, onToggleSidebar }) {
  const location = useLocation();
  const { lastUpdated } = useLiveStatus();
  const online = useOnline();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsAgo = lastUpdated ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;

  return (
    <header className="ft-topbar" style={theme.topbar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="ft-btn ft-btn-secondary"
          aria-label={compact ? 'Open menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={compact ? 'Menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ ...theme.ghostBtn, padding: 7, display: 'inline-flex', flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {compact ? (
              <path d="M4 6h16M4 12h16M4 18h16" />
            ) : (
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d={sidebarCollapsed ? 'm13 10 2 2-2 2' : 'm15 10-2 2 2 2'} />
              </>
            )}
          </svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="ft-topbar-title" style={{ fontSize: 19, fontWeight: 800, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getScreenTitle(location.pathname)}
          </div>
          {secondsAgo !== null && (
            <div style={theme.liveRow}>
              <span style={online ? theme.liveDot : { ...theme.liveDot, background: WARNING, animation: 'none' }} />
              <span style={{ fontFamily: theme.mono, fontSize: 12, color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                <span className="ft-hide-phone">{online ? 'auto-refreshing · ' : 'offline · last '}</span>updated {secondsAgo}s ago
              </span>
            </div>
          )}
        </div>
      </div>
      <div style={theme.topbarRight}>
        <UserMenu />
      </div>
    </header>
  );
}
