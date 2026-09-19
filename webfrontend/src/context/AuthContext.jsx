import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as hrApi from '../api/hr';
import { getToken, setToken, clearToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | guest

  const clearSession = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('guest');
  }, []);

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
      return;
    }
    hrApi
      .getMe()
      .then((me) => {
        setUser(me);
        setStatus('authed');
      })
      .catch(() => {
        clearToken();
        setStatus('guest');
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: hrUser } = await hrApi.login(email, password);
    setToken(token);
    setUser(hrUser);
    setStatus('authed');
    return hrUser;
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, setUser }),
    [user, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
