import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

import './globals.css';
import Header from './_components/header';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Summa Academy 桂冠书院 - Teacher',
  applicationName: 'Summa Academy 桂冠书院 - Teacher',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
