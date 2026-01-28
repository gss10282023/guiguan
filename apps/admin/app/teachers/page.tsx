'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useApi } from '../_lib/api';
import { useRequireAdmin } from '../_lib/auth';

type TeacherListItem = {
  id: string;
  email: string | null;
  displayName: string | null;
  timeZone: string | null;
  createdAt: string;
};

const TIME_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Australia/Sydney', label: '悉尼 (Australia/Sydney)' },
  { value: 'Asia/Shanghai', label: '上海 (Asia/Shanghai)' },
  { value: 'Asia/Singapore', label: '新加坡 (Asia/Singapore)' },
  { value: 'Asia/Tokyo', label: '东京 (Asia/Tokyo)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: '伦敦 (Europe/London)' },
  { value: 'America/New_York', label: '纽约 (America/New_York)' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (America/Los_Angeles)' },
  { value: 'Pacific/Auckland', label: '奥克兰 (Pacific/Auckland)' },
];

export default function TeachersPage() {
  const router = useRouter();
  const { hydrated, accessToken } = useRequireAdmin();
  const { apiFetchJson } = useApi();

  const [teachers, setTeachers] = useState<TeacherListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [displayName, setDisplayName] = useState('');
  const [timeZone, setTimeZone] = useState('Australia/Sydney');

  const refresh = async () => {
    const data = await apiFetchJson<TeacherListItem[]>('/admin/teachers');
    setTeachers(data);
  };

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void refresh().catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, hydrated]);

  return (
    <main className="stack">
      <h1 style={{ margin: 0 }}>老师</h1>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div>{success}</div> : null}

      <div className="card stack">
        <strong>创建老师</strong>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setSuccess(null);

            if (!email || !displayName || !timeZone || password.length < 8) {
              setError('请填写完整信息（密码至少 8 位）');
              return;
            }

            setLoading(true);
            try {
              const created = await apiFetchJson<{ id: string }>('/admin/teachers', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, password, displayName, timeZone }),
              });
              setEmail('');
              setDisplayName('');
              router.push(`/teachers/${created.id}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : '创建失败');
            } finally {
              setLoading(false);
            }
          }}
        >
          <label className="field">
            <span className="muted">邮箱</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label className="field">
            <span className="muted">初始密码（至少 8 位）</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          <label className="field">
            <span className="muted">姓名</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>

          <label className="field">
            <span className="muted">时区</span>
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {TIME_ZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? '创建中…' : '创建'}
          </button>
        </form>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>老师列表</strong>
          <button className="btnSecondary" type="button" onClick={() => void refresh()} disabled={teachers === null}>
            刷新
          </button>
        </div>

        {teachers === null ? (
          <div className="muted">加载中…</div>
        ) : teachers.length === 0 ? (
          <div className="muted">暂无老师</div>
        ) : (
          <div className="stack">
            {teachers.map((teacher) => (
              <div key={teacher.id} className="card stack">
                <Link href={`/teachers/${teacher.id}`} style={{ display: 'block' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{teacher.displayName ?? '—'}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {teacher.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    {teacher.email ?? '—'}
                  </div>
                </Link>

                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    className="btnDanger"
                    type="button"
                    disabled={deletingId !== null}
                    onClick={async () => {
                      setError(null);
                      setSuccess(null);
                      if (!window.confirm('确认删除该老师吗？（将会禁用账号并从列表隐藏）')) return;
                      setDeletingId(teacher.id);
                      try {
                        await apiFetchJson(`/admin/teachers/${teacher.id}`, { method: 'DELETE' });
                        await refresh();
                        setSuccess('已删除老师');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '删除失败');
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                  >
                    {deletingId === teacher.id ? '删除中…' : '删除'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
