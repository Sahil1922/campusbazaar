import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { disconnectSocket } from './lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api('/auth/me')
      .then((data) => !cancelled && setUser(data.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/sign-out', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  // The Socket.IO connection is authenticated as whoever was signed in when it opened.
  const userId = user?.id;
  useEffect(() => () => disconnectSocket(), [userId]);

  const value = useMemo(() => ({ user, setUser, loading, signOut }), [user, loading, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export const hasRole = (user, role) => Boolean(user?.roles?.includes(role));
