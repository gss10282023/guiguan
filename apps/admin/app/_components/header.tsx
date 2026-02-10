'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '../_lib/auth';

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

  if (!hydrated || !accessToken) return null;

  return (
    <header className="appHeader">
      <div className="appHeaderInner">
        <div className="row">
          <strong>Admin</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            MVP
          </span>
        </div>

        <nav className="navBar" aria-label="导航">
          <div className="navGroup">
            <NavLink href="/students" label="学生" />
            <NavLink href="/teachers" label="老师" />
            <NavLink href="/rates" label="费率" />
            <NavLink href="/sessions" label="排课" />
            <NavLink href="/change-requests" label="审批" />
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
