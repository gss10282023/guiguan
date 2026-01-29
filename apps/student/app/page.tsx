'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from './_lib/auth';

export default function Page() {
  const router = useRouter();
  const { hydrated, accessToken } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(accessToken ? '/calendar' : '/login');
  }, [accessToken, hydrated, router]);

  return <main className="muted">加载中…</main>;
}
