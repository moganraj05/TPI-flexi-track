import { lazy, useEffect } from 'react';
import './fonts';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
// Login stays a static import within this chunk — it's small (no heavy deps
// of its own) and it's the very first thing an unauthenticated visitor to
// /staff needs, so there's nothing to gain and a round-trip to lose by
// deferring it.
import { Login } from './pages/Login';
// Signed-out pages are imported eagerly like Login — the lazy-route
// Suspense boundary lives inside AppShell, which these pages sit outside of.
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { SetPassword } from './pages/SetPassword';

// Every authenticated page loads on demand instead of all up front. These
// are the pages that pull in the bulk of the console's own code (tables,
// forms, per-page query/filter logic); splitting them means a first visit
// to /staff/login (or a route no one uses that session, e.g. Settings) never
// pays for the others.
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
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const PasswordRequests = lazy(() => import('./pages/PasswordRequests').then((m) => ({ default: m.PasswordRequests })));
const AuditLog = lazy(() => import('./pages/AuditLog').then((m) => ({ default: m.AuditLog })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

// The HR / admin ops console, mounted at /staff/* by App.jsx. It keeps its own
// sign-in session (AuthContext, token key `flexitrack_hr_token`) and its own
// live-update socket, fully separate from the worker/incharge app at "/" —
// signing in or out of one never touches the other.
export default function StaffApp() {
  useEffect(() => {
    document.title = 'FlexiTrack Ops Console';
  }, []);

  return (
    <AuthProvider>
      <SocketProvider>
        <Routes>
          <Route index element={<Navigate to="/staff/app/dashboard" replace />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="set-password" element={<SetPassword />} />
          <Route
            path="app"
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
            <Route path="password-requests" element={<PasswordRequests />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </SocketProvider>
    </AuthProvider>
  );
}
