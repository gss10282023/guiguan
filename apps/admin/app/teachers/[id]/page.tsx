'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useApi } from '../../_lib/api';
import { useRequireAdmin } from '../../_lib/auth';

type TeacherDetail = {
  id: string;
  email: string | null;
  displayName: string | null;
  timeZone: string | null;
  createdAt: string;
};

export default function TeacherDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hydrated, accessToken } = useRequireAdmin();
  const { apiFetchJson } = useApi();

  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const data = await apiFetchJson<TeacherDetail>(`/admin/teachers/${params.id}`);
        if (!cancelled) setTeacher(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiFetchJson, hydrated, params.id]);

  return (
    <main className="stack">
      <h1 style={{ margin: 0 }}>老师详情</h1>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div>{success}</div> : null}

      {teacher === null ? (
        <div className="card muted">加载中…</div>
      ) : (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{teacher.displayName ?? '—'}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {teacher.createdAt.slice(0, 10)}
            </span>
          </div>

          <div className="muted">邮箱：{teacher.email ?? '—'}</div>
          <div className="muted">时区：{teacher.timeZone ?? '—'}</div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btnDanger"
              type="button"
              disabled={deleting}
              data-testid="teacher-delete"
              onClick={async () => {
                setError(null);
                setSuccess(null);
                if (!window.confirm('确认删除该老师吗？（将会禁用账号并从列表隐藏）')) return;
                setDeleting(true);
                try {
                  await apiFetchJson(`/admin/teachers/${teacher.id}`, { method: 'DELETE' });
                  setSuccess('已删除老师');
                  router.push('/teachers');
                } catch (err) {
                  setError(err instanceof Error ? err.message : '删除失败');
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? '删除中…' : '删除'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
