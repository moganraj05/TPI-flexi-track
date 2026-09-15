import { NavLink } from 'react-router-dom';
import { Icon } from '../common/Icon';

const TABS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/app/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/app/live', label: 'Shift Live', icon: 'live' },
  { to: '/app/reports', label: 'Reports', icon: 'reports' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
];

export function BottomNav() {
  return (
    <nav style={styles.wrap}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          style={({ isActive }) => ({
            ...styles.tab,
            color: isActive ? 'var(--blue)' : 'var(--ink-soft)',
          })}
        >
          <Icon name={tab.icon} size={22} />
          <span style={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: 'var(--shell-max-width)',
    height: 'var(--bottomnav-h)',
    background: 'var(--white)',
    borderTop: '1px solid var(--line)',
    display: 'flex',
    zIndex: 20,
    paddingBottom: 'env(safe-area-inset-bottom, 0)',
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'Manrope, sans-serif',
  },
};
