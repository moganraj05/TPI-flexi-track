import { useLocation } from 'react-router-dom';
import { initials } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

const PAGE_META = {
  '/app/dashboard': { eyebrow: 'Overview', title: 'Dashboard' },
  '/app/attendance': { eyebrow: 'Completed polls', title: 'Attendance' },
  '/app/live': { eyebrow: 'In progress', title: 'Shift Live' },
  '/app/reports': { eyebrow: 'Export data', title: 'Reports' },
  '/app/settings': { eyebrow: 'Your account', title: 'Settings' },
};

export function TopBar() {
  const { user } = useAuth();
  const location = useLocation();
  const { eyebrow, title } = PAGE_META[location.pathname] || { eyebrow: '', title: 'FlexiTrack HR' };
  return (
    <header style={styles.wrap}>
      <div>
        {eyebrow && <p style={styles.eyebrow}>{eyebrow}</p>}
        <h1 style={styles.title}>{title}</h1>
      </div>
      <div style={styles.avatar} title={user?.name}>
        {initials(user?.name)}
      </div>
    </header>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: 'var(--shell-max-width)',
    height: 'var(--topbar-h)',
    background: 'var(--white)',
    borderBottom: '1px solid var(--line)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px 14px',
    zIndex: 20,
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ink-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  title: {
    fontSize: 22,
    marginTop: 4,
    color: 'var(--ink)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: 'var(--blue-deep)',
    color: 'var(--white)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  },
};
