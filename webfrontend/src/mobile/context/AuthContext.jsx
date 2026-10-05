import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthorizedHandler, tokenStorage, userStorage } from '../api';
import { syncPushSubscription, unsubscribeLocally } from '../push';
import { WORKER_APP_ROLES } from '../utils';

// Sign-in session of the worker / incharge app — independent of the HR
// console's session (src/context/AuthContext.jsx), which keeps its own token.
const AuthContext = createContext(null);

// Every query of this app is keyed under ['m', ...], so one call drops the
// previous person's data from memory (a factory phone can be shared).
const clearAppQueries = (queryClient) => queryClient.removeQueries({ queryKey: ['m'] });

export function MobileAuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | guest

  const clearSession = useCallback(() => {
    tokenStorage.remove();
    userStorage.remove();
    clearAppQueries(queryClient);
    setUser(null);
    setStatus('guest');
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Restore the session on load. With no connection the cached profile is
  // used (same as the Expo app), so the app still opens; the next request
  // that reaches the server confirms or ends the session.
  useEffect(() => {
    let cancelled = false;
    const token = tokenStorage.get();
    if (!token) {
      setStatus('guest');
      return undefined;
    }

    api
      .getMe()
      .then((result) => {
        if (cancelled) return;
        const me = result.data;
        if (!WORKER_APP_ROLES.includes(me?.role)) {
          clearSession();
          return;
        }
        userStorage.set(me);
        setUser(me);
        setStatus('authed');
        syncPushSubscription();
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          return;
        }
        const cached = userStorage.get();
        if (cached && WORKER_APP_ROLES.includes(cached.role)) {
          setUser(cached);
          setStatus('authed');
        } else {
          clearSession();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (employeeId, password) => {
      const result = await api.login(employeeId, password);
      clearAppQueries(queryClient);
      tokenStorage.set(result.data.token);
      userStorage.set(result.data.user);
      setUser(result.data.user);
      setStatus('authed');
      // If this browser already allowed notifications, attach them to the
      // person who just signed in (never prompts).
      syncPushSubscription();
      return result.data.user;
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    await unsubscribeLocally();
    try {
      await api.logout();
    } catch {
      // Token may already be invalid — the local sign-out below still happens.
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const result = await api.getMe();
    userStorage.set(result.data);
    setUser(result.data);
  }, []);

  const value = useMemo(
    () => ({ user, status, isAuthenticated: status === 'authed', login, logout, refreshUser }),
    [user, status, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useMobileAuth must be used within MobileAuthProvider');
  return ctx;
}
