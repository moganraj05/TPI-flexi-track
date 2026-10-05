import { NavLink } from 'react-router-dom';
import { theme, navButtonStyle } from '../../theme';
import brandMark from '../../assets/brand-mark.svg';

// 18px stroke icons for the nav — needed once the sidebar can collapse to an
// icon-only rail, where a label no longer fits.
const ICONS = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  live: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  attendance: (
    <>
      <rect x="8" y="2.5" width="8" height="4" rx="1" />
      <path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  workforce: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  notifications: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  reports: (
    <>
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5Z" />
      <path d="M14 2.5v6h6M8 17v-3M12 17v-6M16 17v-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
};

const NAV = [
  { to: '/staff/app/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/staff/app/live', label: 'Live Board', icon: 'live' },
  { to: '/staff/app/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/staff/app/workforce', label: 'Workforce', icon: 'workforce' },
  { to: '/staff/app/notifications', label: 'Notifications', icon: 'notifications' },
  { to: '/staff/app/reports', label: 'Reports', icon: 'reports' },
  { to: '/staff/app/settings', label: 'Settings', icon: 'settings' },
];

function NavIcon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {ICONS[name]}
    </svg>
  );
}

// `collapsed` shrinks it to an icon rail (labels move into tooltips), toggled
// from the Topbar and remembered per browser by AppShell.
export function Sidebar({ collapsed }) {
  return (
    <aside
      style={{
        ...theme.sidebar,
        width: collapsed ? 68 : theme.sidebar.width,
        padding: collapsed ? '20px 10px' : theme.sidebar.padding,
        position: 'relative',
        overflow: 'hidden',
        transition: 'width 180ms ease-out, padding 180ms ease-out',
      }}
      aria-label="Main navigation"
    >
      <img src={brandMark} alt="" style={theme.sidebarWatermark} aria-hidden="true" />
      <div style={{ ...theme.sidebarBrandRow, justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0 0 20px' : theme.sidebarBrandRow.padding }}>
        <img src={brandMark} alt="FlexiTrack" style={theme.loginMark} />
        {!collapsed && (
          <div style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: theme.sidebarBrandColor }}>FlexiTrack</div>
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.sidebarMuted }}>
              Ops Console
            </div>
          </div>
        )}
      </div>
      <nav style={theme.navList}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            style={({ isActive }) => ({
              ...navButtonStyle(isActive),
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px 0' : '10px 12px',
              whiteSpace: 'nowrap',
            })}
          >
            <NavIcon name={item.icon} />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
