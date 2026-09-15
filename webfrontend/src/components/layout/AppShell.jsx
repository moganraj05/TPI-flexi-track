import { Outlet } from 'react-router-dom';
import { theme } from '../../theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { LiveStatusProvider } from '../../context/LiveStatusContext';
import { ToastProvider } from '../../context/ToastContext';

export function AppShell() {
  return (
    <ToastProvider>
      <LiveStatusProvider>
        <div style={theme.appShell}>
          <Sidebar />
          <div style={theme.mainCol}>
            <Topbar />
            <main className="ft-content" style={theme.content}>
              <Outlet />
            </main>
          </div>
        </div>
      </LiveStatusProvider>
    </ToastProvider>
  );
}
