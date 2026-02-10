'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '../_lib/auth';
import { useDisplayTimeZone } from '../_lib/display-timezone';

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link href={href} className="navItem" aria-current={active ? 'page' : undefined}>
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
    <header className="appHeader">
      <div className="appHeaderInner">
        <div className="row">
          <strong>Student</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            MVP
          </span>
        </div>

        <nav className="navBar" aria-label="导航">
          <label className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              显示时区
            </span>
            <select className="control" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="navGroup">
            <NavLink href="/calendar" label="课表" />
            <NavLink href="/hours" label="课时" />
          </div>
          <button
            className="btnSecondary btnSm"
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
