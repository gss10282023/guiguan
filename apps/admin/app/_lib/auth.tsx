'use client';

import type { ReactNode } from 'react';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

type AuthContextValue = {
  accessToken: string | null;
  role: UserRole | null;
  hydrated: boolean;
  setAccessToken: (accessToken: string | null) => void;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const ACCESS_TOKEN_STORAGE_KEY = 'guiguan:admin:accessToken';

function parseJwtRole(accessToken: string | null): UserRole | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadPart = parts[1];
    if (!payloadPart) return null;

    const payloadBase64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadBase64.padEnd(payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4), '=');
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { role?: unknown };
    if (payload.role === 'ADMIN' || payload.role === 'TEACHER' || payload.role === 'STUDENT') return payload.role;
    return null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (stored) {
      setAccessTokenState(stored);
      setRole(parseJwtRole(stored));
    }
    setHydrated(true);
  }, []);

  const setAccessToken = useCallback((next: string | null) => {
    setAccessTokenState(next);
    setRole(parseJwtRole(next));
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
    () => ({ accessToken, role, hydrated, setAccessToken, refreshAccessToken, logout }),
    [accessToken, hydrated, logout, refreshAccessToken, role, setAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function useRequireAdmin() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.hydrated) return;
    if (!auth.accessToken) {
      router.replace('/login');
      return;
    }
    if (auth.role !== 'ADMIN') {
      void auth.logout().finally(() => router.replace('/login'));
    }
  }, [auth, router]);

  return auth;
}
