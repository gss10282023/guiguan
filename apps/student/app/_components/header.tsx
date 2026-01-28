'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '../_lib/auth';
import { useDisplayTimeZone } from '../_lib/display-timezone';

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
  const { timeZone, setTimeZone, options } = useDisplayTimeZone();

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
        }}
      >
        <div className="row">
          <strong>Student</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            MVP
          </span>
        </div>

        <nav className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              显示时区
            </span>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: 10,
                padding: '8px 10px',
                background: '#ffffff',
              }}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <NavLink href="/calendar" label="课表" />
          <NavLink href="/hours" label="课时" />
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
