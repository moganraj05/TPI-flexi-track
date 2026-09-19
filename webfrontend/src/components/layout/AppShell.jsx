import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { theme } from '../../theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { LiveStatusProvider } from '../../context/LiveStatusContext';
import { ToastProvider } from '../../context/ToastContext';
import { CenteredSpinner } from '../common/Spinner';

export function AppShell() {
  return (
    <ToastProvider>
      <LiveStatusProvider>
        <div style={theme.appShell}>
          <Sidebar />
          <div style={theme.mainCol}>
            <Topbar />
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
