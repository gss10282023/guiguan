import type { ReactNode } from 'react';

export const metadata = {
  title: 'Student',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

