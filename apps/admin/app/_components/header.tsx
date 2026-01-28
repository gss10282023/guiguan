'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '../_lib/auth';

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid',
        borderColor: active ? '#111827' : '#e5e7eb',
        background: active ? '#111827' : '#ffffff',
        color: active ? '#ffffff' : '#111827',
      }}
    >
      {label}
    </Link>
  );
}

export default function Header() {
  const router = useRouter();
  const { accessToken, hydrated, logout } = useAuth();

  if (!hydrated || !accessToken) return null;

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderBottom: '1px solid #e5e7eb',
        background: '#ffffff',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="row">
          <strong>Admin</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            MVP
          </span>
        </div>

        <nav className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <NavLink href="/students" label="学生" />
          <NavLink href="/teachers" label="老师" />
          <NavLink href="/rates" label="费率" />
          <NavLink href="/sessions" label="排课" />
          <NavLink href="/change-requests" label="审批" />
          <button
            className="btnSecondary"
            type="button"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            退出
          </button>
        </nav>
      </div>
    </header>
  );
}

