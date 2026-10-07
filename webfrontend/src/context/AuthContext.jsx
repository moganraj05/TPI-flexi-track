import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as hrApi from '../api/hr';
import { getToken, setToken, clearToken, setUnauthorizedHandler, getCachedUser, setCachedUser } from '../api/client';

// Every console query key starts with "hr-" — removed on sign-out so the
// data saved on this device for offline use goes with the session.
const isConsoleQuery = (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('hr-');

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | guest

  const setUser = useCallback((next) => {
    setUserState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value) setCachedUser(value);
      return value;
    });
  }, []);

  const clearSession = useCallback(() => {
    clearToken();
    queryClient.removeQueries({ predicate: isConsoleQuery });
    setUserState(null);
    setStatus('guest');
  }, [queryClient]);

  useEffect(() => {
    // A 401 means the token is already invalid — just drop it locally.
    // Calling the /logout endpoint here would itself 401 and re-trigger
    // this same handler.
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  const logout = useCallback(async () => {
    try {
      await hrApi.logout();
    } catch {
      // Token may already be invalid/expired — clear the local session anyway.
    }
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('guest');
      return undefined;
    }
    // Stay signed in until "Log out": only the server rejecting the session
    // (401) ends it. No connection, a sleeping/restarting server or any other
    // error keeps it — the console opens with the remembered user (and its
    // saved data) and keeps trying to confirm the session in the background.
    const cached = getCachedUser();
    if (cached) {
      setUserState(cached);
      setStatus('authed');
    }
    let cancelled = false;
    let timer = null;
    let delay = 2000;
    const attempt = () => {
      clearTimeout(timer);
      hrApi
        .getMe()
        .then((me) => {
          if (cancelled) return;
          setUser(me);
          setStatus('authed');
        })
        .catch((error) => {
          if (cancelled) return;
          if (error.status === 401) {
            clearSession();
            return;
          }
          // Not confirmed yet: try again (sooner when the connection is back).
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
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [clearSession, setUser]);

  const login = useCallback(async (email, password) => {
    const { token, user: hrUser } = await hrApi.login(email, password);
    setToken(token);
    queryClient.removeQueries({ predicate: isConsoleQuery });
    setUser(hrUser);
    setStatus('authed');
    return hrUser;
  }, [queryClient, setUser]);

  const value = useMemo(
    () => ({ user, status, login, logout, setUser }),
    [user, status, login, logout, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
