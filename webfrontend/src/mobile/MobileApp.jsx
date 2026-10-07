import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import './mobile.css';
import './fonts';
import { TabBar } from './components/TabBar';
import { Loading } from './components/ui';
import { MobileAuthProvider, useMobileAuth } from './context/AuthContext';
import { MobileRealtimeProvider } from './context/RealtimeContext';
import { MobileThemeProvider, useMobileTheme } from './context/ThemeContext';
import { MobileToastProvider } from './context/ToastContext';
import { useResetRequests, useTodayPoll } from './hooks';
import { hasStaffSession } from './api';
import { LoginPage } from './pages/Login';
import { SetOwnPassword } from './pages/SetOwnPassword';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { homeRouteFor, isInchargeRole } from './utils';
import { OutboxSync } from './offline/OutboxSync';
import { OfflineBanner } from './offline/OfflineBanner';
import { useOutbox } from './offline/outbox';

// Screens load on demand — a worker never downloads the incharge screens.
const WorkerHome = lazy(() => import('./pages/worker/Home').then((m) => ({ default: m.WorkerHome })));
const WorkerHistory = lazy(() => import('./pages/worker/History').then((m) => ({ default: m.WorkerHistory })));
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));
const InchargeDashboard = lazy(() => import('./pages/incharge/Dashboard').then((m) => ({ default: m.InchargeDashboard })));
const InchargeTeam = lazy(() => import('./pages/incharge/Team').then((m) => ({ default: m.InchargeTeam })));
const InchargeRequests = lazy(() => import('./pages/incharge/Requests').then((m) => ({ default: m.InchargeRequests })));
const InchargePollDetail = lazy(() =>
  import('./pages/incharge/PollDetail').then((m) => ({ default: m.InchargePollDetail }))
);

// The worker / incharge app — the web version of the Expo mobile app,
// mounted at "/" by App.jsx (the HR console lives under /staff).
export default function MobileApp() {
  useEffect(() => {
    document.title = 'FlexiTrack';
  }, []);

  return (
    <MobileThemeProvider>
      <ThemedRoot>
        <MobileAuthProvider>
          <MobileRealtimeProvider>
            <MobileToastProvider>
              <OfflineBanner />
              <OutboxSync />
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route index element={<RootRedirect />} />
                  <Route path="login" element={<LoginPage />} />
                  <Route path="set-password" element={<SetOwnPassword />} />
                  <Route path="forgot" element={<ForgotPasswordPage />} />

                  <Route element={<RequireRole kind="worker" />}>
                    <Route element={<TabLayout />}>
                      <Route path="home" element={<WorkerHome />} />
                      <Route path="history" element={<WorkerHistory />} />
                      <Route path="profile" element={<ProfilePage />} />
                    </Route>
                  </Route>

                  <Route path="incharge" element={<RequireRole kind="incharge" />}>
                    <Route element={<TabLayout />}>
                      <Route index element={<InchargeDashboard />} />
                      <Route path="team" element={<InchargeTeam />} />
                      <Route path="requests" element={<InchargeRequests />} />
                      <Route path="profile" element={<ProfilePage />} />
                    </Route>
                    <Route path="poll/:id" element={<InchargePollDetail />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </MobileToastProvider>
          </MobileRealtimeProvider>
        </MobileAuthProvider>
      </ThemedRoot>
    </MobileThemeProvider>
  );
}

function ThemedRoot({ children }) {
  const { resolved } = useMobileTheme();
  return (
    <div className="m-root" data-theme={resolved}>
      {children}
    </div>
  );
}

// "/" — the installed app's start page. Sends each person to their own
// home: worker → Poll, incharge/supervisor → Dashboard. An HR user who opens
// the app (and has no worker session) goes to their console at /staff.
function RootRedirect() {
  const { status, user } = useMobileAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authed' && user) return <Navigate to={user.mustChangePassword ? '/set-password' : homeRouteFor(user.role)} replace />;
  if (hasStaffSession()) return <Navigate to="/staff/app/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

// Signed in, and the right kind of account for this part of the app
// (a worker opening an incharge link lands on their own home, and the other
// way round).
function RequireRole({ kind }) {
  const { status, user } = useMobileAuth();
  if (status === 'loading') return <Loading />;
  if (status !== 'authed' || !user) return <Navigate to="/login" replace />;
  // A temporary password (or an admin's request): set a new one first.
  if (user.mustChangePassword) return <Navigate to="/set-password" replace />;
  const isIncharge = isInchargeRole(user.role);
  if ((kind === 'incharge') !== isIncharge) return <Navigate to={homeRouteFor(user.role)} replace />;
  return <Outlet />;
}

function TabLayout() {
  const { user } = useMobileAuth();
  const incharge = isInchargeRole(user?.role);
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
      {incharge ? <InchargeTabBar /> : <WorkerTabBar />}
    </>
  );
}

// The worker's tab bar shows a dot on "Poll" while today's poll is still
// unanswered (shares the Poll screen's cached query — no extra request).
function WorkerTabBar() {
  const { user } = useMobileAuth();
  const { data } = useTodayPoll();
  const outbox = useOutbox(user?.id);
  const poll = data?.data;
  const savedOffline = !!poll && outbox.some((e) => e.pollId === poll.id);
  const unanswered = !!poll && !poll.myResponse && !savedOffline && new Date(poll.opensAt) <= new Date();
  return <TabBar pollUnanswered={unanswered} />;
}

// The incharge's tab bar shows how many password reset requests are waiting
// (kept live by the "reset:update" socket event).
function InchargeTabBar() {
  const { data } = useResetRequests('pending');
  return <TabBar isIncharge requestCount={data?.meta?.pendingCount ?? 0} />;
}
