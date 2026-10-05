import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import './mobile.css';
import { TabBar } from './components/TabBar';
import { Loading } from './components/ui';
import { MobileAuthProvider, useMobileAuth } from './context/AuthContext';
import { MobileRealtimeProvider } from './context/RealtimeContext';
import { MobileThemeProvider, useMobileTheme } from './context/ThemeContext';
import { MobileToastProvider } from './context/ToastContext';
import { useTodayPoll } from './hooks';
import { hasStaffSession } from './api';
import { LoginPage } from './pages/Login';
import { homeRouteFor, isInchargeRole } from './utils';

// Screens load on demand — a worker never downloads the incharge screens.
const WorkerHome = lazy(() => import('./pages/worker/Home').then((m) => ({ default: m.WorkerHome })));
const WorkerHistory = lazy(() => import('./pages/worker/History').then((m) => ({ default: m.WorkerHistory })));
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));
const InchargeDashboard = lazy(() => import('./pages/incharge/Dashboard').then((m) => ({ default: m.InchargeDashboard })));
const InchargeTeam = lazy(() => import('./pages/incharge/Team').then((m) => ({ default: m.InchargeTeam })));
const InchargePollDetail = lazy(() =>
  import('./pages/incharge/PollDetail').then((m) => ({ default: m.InchargePollDetail }))
);

// The app's own typefaces (same as the Expo app), loaded only when this part
// of the site is opened — the HR console never pays for them.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';
function useAppFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-ft-mobile-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    link.dataset.ftMobileFonts = 'true';
    document.head.appendChild(link);
  }, []);
}

// The worker / incharge app — the web version of the Expo mobile app,
// mounted at "/" by App.jsx (the HR console lives under /staff).
export default function MobileApp() {
  useAppFonts();
  useEffect(() => {
    document.title = 'FlexiTrack';
  }, []);

  return (
    <MobileThemeProvider>
      <ThemedRoot>
        <MobileAuthProvider>
          <MobileRealtimeProvider>
            <MobileToastProvider>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route index element={<RootRedirect />} />
                  <Route path="login" element={<LoginPage />} />

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
  if (status === 'authed' && user) return <Navigate to={homeRouteFor(user.role)} replace />;
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
      {incharge ? <TabBar isIncharge /> : <WorkerTabBar />}
    </>
  );
}

// The worker's tab bar shows a dot on "Poll" while today's poll is still
// unanswered (shares the Poll screen's cached query — no extra request).
function WorkerTabBar() {
  const { data } = useTodayPoll();
  const poll = data?.data;
  const unanswered = !!poll && !poll.myResponse && new Date(poll.opensAt) <= new Date();
  return <TabBar pollUnanswered={unanswered} />;
}
