import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { theme } from '../../theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { OfflineBanner } from './OfflineBanner';
import { LiveStatusProvider } from '../../context/LiveStatusContext';
import { ToastProvider } from '../../context/ToastContext';
import { CenteredSpinner } from '../common/Spinner';
import { COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useResponsiveTables } from '../../hooks/useResponsiveTables';

const SIDEBAR_KEY = 'flexitrack_hr_sidebar_collapsed';

// Remembered per browser. With nothing saved yet, narrower laptop screens
// (split-screen, small laptops) start collapsed so the content gets the room.
function initialCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // storage unavailable — fall through to the width-based default
  }
  return window.innerWidth < 1100;
}

// Laptop / desktop: sidebar on the left (full or icon rail).
// Tablet / phone (< 900px): the sidebar becomes a slide-in drawer opened from
// the menu button in the top bar, so pages get the full screen width.
export function AppShell() {
  const compact = useMediaQuery(COMPACT_QUERY);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const contentRef = useRef(null);
  useResponsiveTables(contentRef);

  // Navigating (or growing back to laptop width) closes the drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, compact]);

  const toggleSidebar = useCallback(() => {
    if (compact) {
      setDrawerOpen((o) => !o);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        // still toggles for this visit
      }
      return next;
    });
  }, [compact]);

  return (
    <ToastProvider>
      <LiveStatusProvider>
        <div className="ft-shell" style={theme.appShell}>
          <Sidebar collapsed={!compact && collapsed} drawer={compact} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
          <div className="ft-main" style={theme.mainCol}>
            <OfflineBanner />
            <Topbar compact={compact} sidebarCollapsed={compact ? !drawerOpen : collapsed} onToggleSidebar={toggleSidebar} />
            <main ref={contentRef} className="ft-content" style={theme.content}>
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
