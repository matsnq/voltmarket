import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tryRefresh, clearAccessToken, setAccessToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On app load: silent refresh. The httpOnly refresh cookie (if present)
  // yields a fresh in-memory access token — this is how the login survives
  // an F5 even though the access token itself is never persisted.
  useEffect(() => {
    tryRefresh()
      .then((data) => {
        if (data) setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password, otp) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: otp ? { email, password, otp } : { email, password },
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/auth/register', { method: 'POST', body: payload });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await api('/auth/logout-all', { method: 'POST' });
    } finally {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, logoutAll, refreshUser, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
