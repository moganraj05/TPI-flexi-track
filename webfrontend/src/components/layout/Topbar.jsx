import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { theme } from '../../theme';
import { useLiveStatus } from '../../context/LiveStatusContext';
import { UserMenu } from './UserMenu';

const TITLES = {
  dashboard: 'Overview',
  live: 'Live Board',
  attendance: 'Attendance',
  workforce: 'Workforce',
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

export function Topbar() {
  const location = useLocation();
  const { lastUpdated } = useLiveStatus();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsAgo = lastUpdated ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;

  return (
    <header style={theme.topbar}>
      <div>
        <div style={{ fontSize: 19, fontWeight: 800, color: theme.textPrimary }}>{getScreenTitle(location.pathname)}</div>
        {secondsAgo !== null && (
          <div style={theme.liveRow}>
            <span style={theme.liveDot} />
            <span style={{ fontFamily: theme.mono, fontSize: 12, color: theme.textSecondary }}>
              auto-refreshing · updated {secondsAgo}s ago
            </span>
          </div>
        )}
      </div>
      <div style={theme.topbarRight}>
        <UserMenu />
      </div>
    </header>
  );
}
