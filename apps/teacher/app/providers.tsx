'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from './_lib/auth';
import { DisplayTimeZoneProvider } from './_lib/display-timezone';
import A2HSPrompt from './_components/a2hs-prompt';
import PwaRegister from './_components/pwa-register';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DisplayTimeZoneProvider>
        <PwaRegister />
        <A2HSPrompt label="Teacher" />
        {children}
      </DisplayTimeZoneProvider>
    </AuthProvider>
  );
}
