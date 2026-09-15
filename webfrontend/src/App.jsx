import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LiveBoard } from './pages/LiveBoard';
import { Attendance } from './pages/Attendance';
import { AttendanceDetail } from './pages/AttendanceDetail';
import { Workforce } from './pages/Workforce';
import { WorkerDetail } from './pages/WorkerDetail';
import { InchargeDetail } from './pages/InchargeDetail';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
