import { Suspense, useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { theme } from '../../theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { LiveStatusProvider } from '../../context/LiveStatusContext';
import { ToastProvider } from '../../context/ToastContext';
import { CenteredSpinner } from '../common/Spinner';

const SIDEBAR_KEY = 'flexitrack_hr_sidebar_collapsed';

// Remembered per browser. With nothing saved yet, narrow screens (a laptop
// split-screen, a tablet) start collapsed so the content gets the room.
function initialCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // storage unavailable — fall through to the width-based default
  }
  return window.innerWidth < 900;
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        // still toggles for this visit
      }
      return next;
    });
  }, []);

  return (
    <ToastProvider>
      <LiveStatusProvider>
        <div style={theme.appShell}>
          <Sidebar collapsed={collapsed} />
          <div style={theme.mainCol}>
            <Topbar sidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} />
            <main className="ft-content" style={theme.content}>
              {/* Sidebar/Topbar stay mounted across navigation; only this
                  content area waits on a lazy-loaded page's chunk. */}
              <Suspense fallback={<CenteredSpinner />}>
                <Outlet />
              </Suspense>
            </main>
          </div>
        </div>
      </LiveStatusProvider>
    </ToastProvider>
  );
}
