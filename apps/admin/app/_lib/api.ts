'use client';

import { useCallback } from 'react';

import { useAuth } from './auth';

export function useApi() {
  const { accessToken, refreshAccessToken } = useAuth();

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

      const res = await fetch(input, { ...init, headers });
      if (res.status !== 401) return res;

      const refreshed = await refreshAccessToken();
      if (!refreshed) return res;

      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set('authorization', `Bearer ${refreshed}`);
      return fetch(input, { ...init, headers: retryHeaders });
    },
    [accessToken, refreshAccessToken],
  );

  const apiFetchJson = useCallback(
    async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
      const res = await apiFetch(input, init);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const contentType = res.headers.get('content-type') ?? '';

        if (contentType.includes('application/json') && text) {
          try {
            const parsed: unknown = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
              throw new Error(parsed.message);
            }
          } catch (error) {
            if (error instanceof Error && error.message !== text) throw error;
          }
        }

        throw new Error(text || `Request failed: ${res.status}`);
      }
      return (await res.json()) as T;
    },
    [apiFetch],
  );

  return { apiFetch, apiFetchJson };
}
