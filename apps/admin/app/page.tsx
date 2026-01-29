'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from './_lib/auth';

export default function Page() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (!auth.hydrated) return;
    if (!auth.accessToken) {
      router.replace('/login');
      return;
    }
    if (auth.role !== 'ADMIN') {
      void auth.logout().finally(() => router.replace('/login'));
      return;
    }
    router.replace('/students');
  }, [auth, router]);

  return <main className="muted">加载中…</main>;
}
