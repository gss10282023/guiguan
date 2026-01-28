'use client';

import type { ReactNode } from 'react';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type AuthContextValue = {
  accessToken: string | null;
  hydrated: boolean;
  setAccessToken: (accessToken: string | null) => void;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const ACCESS_TOKEN_STORAGE_KEY = 'guiguan:teacher:accessToken';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (stored) setAccessTokenState(stored);
    setHydrated(true);
  }, []);

  const setAccessToken = useCallback((next: string | null) => {
    setAccessTokenState(next);
    if (next) {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  }, []);

  const refreshAccessToken = useCallback(async () => {
    try {
      const res = await fetch('/auth/refresh', { method: 'POST' });
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }

      const data = (await res.json()) as { accessToken?: string };
      if (!data.accessToken) {
        setAccessToken(null);
        return null;
      }

      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    }
  }, [setAccessToken]);

  const logout = useCallback(async () => {
    try {
      await fetch('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  }, [setAccessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({ accessToken, hydrated, setAccessToken, refreshAccessToken, logout }),
    [accessToken, hydrated, logout, refreshAccessToken, setAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.hydrated) return;
    if (!auth.accessToken) router.replace('/login');
  }, [auth.accessToken, auth.hydrated, router]);

  return auth;
}

