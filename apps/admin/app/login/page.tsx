'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '../_lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { hydrated, accessToken, setAccessToken } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (accessToken) router.replace('/students');
  }, [accessToken, hydrated, router]);

  return (
    <main>
      <h1 style={{ marginTop: 0 }}>管理员登录</h1>

      <div className="card" style={{ maxWidth: 420 }}>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);

            try {
              const res = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });

              if (!res.ok) {
                setError('邮箱或密码错误');
                return;
              }

              const data = (await res.json()) as { accessToken?: string };
              if (!data.accessToken) {
                setError('登录失败：缺少 accessToken');
                return;
              }

              const meRes = await fetch('/me', { headers: { authorization: `Bearer ${data.accessToken}` } });
              if (!meRes.ok) {
                setError('登录失败：无法获取用户信息');
                return;
              }

              const me = (await meRes.json()) as { role?: string };
              if (me.role !== 'ADMIN') {
                await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
                setAccessToken(null);
                setError('无管理员权限');
                return;
              }

              setAccessToken(data.accessToken);
              router.replace('/students');
            } catch (err) {
              setError(err instanceof Error ? err.message : '登录失败');
            } finally {
              setLoading(false);
            }
          }}
        >
          <label className="field">
            <span className="muted">邮箱</span>
            <input
              data-testid="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱"
            />
          </label>

          <label className="field">
            <span className="muted">密码</span>
            <input
              data-testid="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="error" data-testid="login-error">
              {error}
            </div>
          ) : null}

          <button className="btn" type="submit" disabled={loading} data-testid="login-submit">
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </main>
  );
}
