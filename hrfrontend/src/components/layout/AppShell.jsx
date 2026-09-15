import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div style={styles.shell}>
      <TopBar />
      <main style={styles.content}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

const styles = {
  shell: {
    maxWidth: 'var(--shell-max-width)',
    margin: '0 auto',
    minHeight: '100vh',
    background: 'var(--surface)',
    position: 'relative',
  },
  content: {
    paddingTop: 'calc(var(--topbar-h) + 16px)',
    paddingBottom: 'calc(var(--bottomnav-h) + 24px)',
    paddingLeft: 16,
    paddingRight: 16,
    minHeight: '100vh',
  },
};
