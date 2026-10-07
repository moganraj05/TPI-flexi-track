import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { CACHE_MAX_AGE, persistOptions } from './offline/persist';

// One site, two apps:
//   /staff/*  HR / admin ops console (StaffApp)
//   /*        worker / incharge app, the web version of the mobile app (MobileApp)
// Each is its own lazily loaded chunk, so a worker's phone never downloads
// the HR console's tables and exports, and HR never downloads the worker app.
const StaffApp = lazy(() => import('./StaffApp'));
const MobileApp = lazy(() => import('./mobile/MobileApp'));

// TanStack Query assumes "online" until the first online/offline event —
// start from the real state, so an app opened without a connection shows
// its saved data instead of firing requests that can only fail.
if (typeof navigator !== 'undefined' && 'onLine' in navigator) onlineManager.setOnline(navigator.onLine);

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
      // Loaded data is kept (in memory and saved on the device, see
      // offline/persist.js) long enough to be useful offline.
      gcTime: CACHE_MAX_AGE,
    },
  },
});

// Save right away when the app is hidden or closed (switching apps, locking
// the phone), instead of waiting for the next throttled save — so data a
// screen just loaded is there the next time the app opens offline.
if (typeof document !== 'undefined') {
  const saveNow = () => {
    persistQueryClientSave({ queryClient, ...persistOptions }).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);
}

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
    // Restores the data saved on this device before any screen fetches,
    // then keeps saving it — the app opens with its last data offline.
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
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
    </PersistQueryClientProvider>
  );
}
