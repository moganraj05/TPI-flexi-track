import { NavLink } from 'react-router-dom';
import { theme, navButtonStyle } from '../../theme';
import brandMark from '../../assets/brand-mark.svg';

const NAV = [
  { to: '/staff/app/dashboard', label: 'Dashboard' },
  { to: '/staff/app/live', label: 'Live Board' },
  { to: '/staff/app/attendance', label: 'Attendance' },
  { to: '/staff/app/workforce', label: 'Workforce' },
  { to: '/staff/app/reports', label: 'Reports' },
  { to: '/staff/app/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside style={{ ...theme.sidebar, position: 'relative', overflow: 'hidden' }}>
      <img src={brandMark} alt="" style={theme.sidebarWatermark} aria-hidden="true" />
      <div style={theme.sidebarBrandRow}>
        <img src={brandMark} alt="" style={theme.loginMark} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: theme.sidebarBrandColor }}>FlexiTrack</div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.sidebarMuted }}>
            Ops Console
          </div>
        </div>
      </div>
      <nav style={theme.navList}>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} style={({ isActive }) => navButtonStyle(isActive)}>
            {({ isActive }) => (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isActive ? theme.accent : 'transparent' }} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
