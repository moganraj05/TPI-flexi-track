import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
// Login stays a static import — it's small (no heavy deps of its own) and
// it's the very first thing an unauthenticated visitor needs, so there's
// nothing to gain and a network round-trip to lose by deferring it.
import { Login } from './pages/Login';

// Every authenticated page loads on demand instead of all up front. These
// are the pages that pull in the bulk of the app's own code (tables,
// forms, per-page query/filter logic); splitting them means a first visit
// to /login (or a route no one uses that session, e.g. Settings) never
// pays for the others. React Router only renders the matched route, so
// which chunk loads is exactly which page is visited — no routing change.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const LiveBoard = lazy(() => import('./pages/LiveBoard').then((m) => ({ default: m.LiveBoard })));
const Attendance = lazy(() => import('./pages/Attendance').then((m) => ({ default: m.Attendance })));
const AttendanceDetail = lazy(() =>
  import('./pages/AttendanceDetail').then((m) => ({ default: m.AttendanceDetail }))
);
const Workforce = lazy(() => import('./pages/Workforce').then((m) => ({ default: m.Workforce })));
const WorkerDetail = lazy(() => import('./pages/WorkerDetail').then((m) => ({ default: m.WorkerDetail })));
const InchargeDetail = lazy(() =>
  import('./pages/InchargeDetail').then((m) => ({ default: m.InchargeDetail }))
);
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const NotificationDemo = lazy(() =>
  import('./pages/NotificationDemo').then((m) => ({ default: m.NotificationDemo }))
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Data younger than this is served straight from cache on mount —
      // no request, no spinner. Without this (staleTime defaults to 0)
      // every navigation back to an already-visited page refetches
      // immediately even if nothing changed a second ago. 30s is short
      // enough that nothing here feels behind, and it never blocks a real
      // update: invalidateQueries (every mutation, every Socket.IO event
      // in SocketContext) always forces a refetch regardless of staleTime.
      // The two screens that are explicitly "live" (Dashboard, LiveBoard)
      // override this to 0 — see their own useQuery calls.
      staleTime: 30 * 1000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="live" element={<LiveBoard />} />
                <Route path="attendance" element={<Attendance />} />
                <Route path="attendance/:pollId" element={<AttendanceDetail />} />
                <Route path="workforce" element={<Workforce />} />
                <Route path="workforce/worker/:id" element={<WorkerDetail />} />
                <Route path="workforce/incharge/:id" element={<InchargeDetail />} />
                <Route path="reports" element={<Reports />} />
                <Route path="notifications-demo" element={<NotificationDemo />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
