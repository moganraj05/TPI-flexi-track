import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setPasswordChangeRequiredHandler, setUnauthorizedHandler, tokenStorage, userStorage } from '../api';
import { getCurrentSubscription, syncPushSubscription, unsubscribeLocally } from '../push';
import { WORKER_APP_ROLES } from '../utils';
import { clearOutbox } from '../offline/outbox';

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
    // Unsent offline answers belong to the person signing out.
    const previous = userStorage.get();
    if (previous?.id) clearOutbox(previous.id);
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

  // The server says a new password must be set first (e.g. an admin required
  // it while this session was open): the app's guards then show the
  // "Set your password" screen.
  useEffect(() => {
    setPasswordChangeRequiredHandler(() =>
      setUser((prev) => {
        if (!prev || prev.mustChangePassword) return prev;
        const next = { ...prev, mustChangePassword: true };
        userStorage.set(next);
        return next;
      })
    );
    return () => setPasswordChangeRequiredHandler(null);
  }, []);

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

    // Stay signed in until "Log out": only the server rejecting the session
    // (401) ends it. No connection, a sleeping/restarting server or any other
    // error keeps it — the remembered profile is used and the session is
    // confirmed in the background, retrying until the server answers.
    const cached = userStorage.get();
    if (cached && WORKER_APP_ROLES.includes(cached.role)) {
      setUser(cached);
      setStatus('authed');
    }
    let timer = null;
    let delay = 2000;
    const attempt = () => {
      clearTimeout(timer);
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
          if (!me.mustChangePassword) syncPushSubscription();
        })
        .catch((error) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 401) {
            clearSession();
            return;
          }
          timer = setTimeout(attempt, delay);
          delay = Math.min(delay * 2, 30000);
        });
    };
    const onOnline = () => {
      delay = 2000;
      attempt();
    };
    attempt();
    window.addEventListener('online', onOnline);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
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
      // person who just signed in (never prompts) — once their password is set.
      if (!result.data.user.mustChangePassword) syncPushSubscription();
      return result.data.user;
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    const endpoint = (await getCurrentSubscription())?.endpoint;
    await unsubscribeLocally();
    try {
      await api.logout(endpoint);
    } catch {
      // Token may already be invalid — the local sign-out below still happens.
    }
    clearSession();
  }, [clearSession]);

  // After the password is changed: the server signed out every other session
  // and returned a fresh token for this one.
  const applyNewSession = useCallback(({ token, user: nextUser }) => {
    tokenStorage.set(token);
    userStorage.set(nextUser);
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const result = await api.getMe();
    userStorage.set(result.data);
    setUser(result.data);
  }, []);

  const value = useMemo(
    () => ({ user, status, isAuthenticated: status === 'authed', login, logout, refreshUser, applyNewSession }),
    [user, status, login, logout, refreshUser, applyNewSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useMobileAuth must be used within MobileAuthProvider');
  return ctx;
}
