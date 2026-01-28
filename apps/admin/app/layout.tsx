import type { ReactNode } from 'react';

import './globals.css';
import Header from './_components/header';
import Providers from './providers';

export const metadata = {
  title: 'Admin',
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
