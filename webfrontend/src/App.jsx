import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// One site, two apps:
//   /staff/*  HR / admin ops console (StaffApp)
//   /*        worker / incharge app, the web version of the mobile app (MobileApp)
// Each is its own lazily loaded chunk, so a worker's phone never downloads
// the HR console's tables and exports, and HR never downloads the worker app.
const StaffApp = lazy(() => import('./StaffApp'));
const MobileApp = lazy(() => import('./mobile/MobileApp'));

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
      // update: invalidateQueries (every mutation, every Socket.IO event)
      // always forces a refetch regardless of staleTime. Screens that are
      // explicitly "live" override this per query.
      staleTime: 30 * 1000,
    },
  },
});

// The HR console used to live at /app/*, /register and /forgot-password.
// Old bookmarks and installed shortcuts keep working: they land on the same
// page under /staff, with the rest of the URL kept.
function LegacyStaffRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/staff${pathname}${search}${hash}`} replace />;
}

function BootFallback() {
  return <div style={{ minHeight: '100vh' }} aria-busy="true" />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<BootFallback />}>
          <Routes>
            <Route path="/staff/*" element={<StaffApp />} />
            <Route path="/app/*" element={<LegacyStaffRedirect />} />
            <Route path="/register" element={<LegacyStaffRedirect />} />
            <Route path="/forgot-password" element={<LegacyStaffRedirect />} />
            <Route path="/*" element={<MobileApp />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
