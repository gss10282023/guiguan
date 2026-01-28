'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useApi } from '../../_lib/api';
import { useRequireAdmin } from '../../_lib/auth';

type TeacherOption = {
  id: string;
  email: string | null;
  displayName: string | null;
};

type StudentDetail = {
  id: string;
  email: string | null;
  displayName: string | null;
  timeZone: string | null;
  createdAt: string;
  remainingUnits: number;
  ledgerEntries: { id: string; deltaUnits: number; reason: string; sessionId: string | null; createdAt: string }[];
};

export default function StudentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hydrated, accessToken } = useRequireAdmin();
  const { apiFetchJson } = useApi();

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [deltaUnits, setDeltaUnits] = useState(5);
  const [reason, setReason] = useState<'PURCHASE' | 'ADJUSTMENT'>('PURCHASE');
  const [teacherId, setTeacherId] = useState<string>('');

  const refresh = async () => {
    const data = await apiFetchJson<StudentDetail>(`/admin/students/${params.id}`);
    setStudent(data);
  };

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const [studentDetail, teacherOptions] = await Promise.all([
          apiFetchJson<StudentDetail>(`/admin/students/${params.id}`),
          apiFetchJson<TeacherOption[]>('/admin/teachers'),
        ]);

        if (cancelled) return;
        setStudent(studentDetail);
        setTeachers(teacherOptions);
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
      <h1 style={{ margin: 0 }}>学生详情</h1>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div data-testid="student-detail-success">{success}</div> : null}

      {student === null ? (
        <div className="card muted">加载中…</div>
      ) : (
        <>
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{student.displayName ?? '—'}</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {student.createdAt.slice(0, 10)}
              </span>
            </div>

            <div className="muted">邮箱：{student.email ?? '—'}</div>
            <div className="muted">时区：{student.timeZone ?? '—'}</div>

            <div>
              剩余课时：{' '}
              <strong data-testid="student-remaining-units">{student.remainingUnits}</strong>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btnDanger"
                type="button"
                disabled={deleting}
                data-testid="student-delete"
                onClick={async () => {
                  setError(null);
                  setSuccess(null);
                  if (!window.confirm('确认删除该学生吗？（将会禁用账号并从列表隐藏）')) return;
                  setDeleting(true);
                  try {
                    await apiFetchJson(`/admin/students/${student.id}`, { method: 'DELETE' });
                    setSuccess('已删除学生');
                    router.push('/students');
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

          <div className="card stack">
            <strong>增加课时</strong>
            <form
              className="row"
              style={{ flexWrap: 'wrap' }}
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setSuccess(null);

                if (!Number.isFinite(deltaUnits) || deltaUnits <= 0) {
                  setError('deltaUnits 必须为正整数');
                  return;
                }

                setLoading(true);
                try {
                  const payload: { deltaUnits: number; reason: typeof reason; teacherId?: string } = { deltaUnits, reason };
                  if (teacherId) payload.teacherId = teacherId;

                  await apiFetchJson<{ id: string }>(`/admin/students/${student.id}/hours`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  setSuccess('已增加课时');
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : '提交失败');
                } finally {
                  setLoading(false);
                }
              }}
            >
              <label className="field" style={{ minWidth: 180 }}>
                <span className="muted">deltaUnits</span>
                <input
                  data-testid="add-hours-deltaUnits"
                  type="number"
                  min={1}
                  step={1}
                  value={deltaUnits}
                  onChange={(e) => setDeltaUnits(Number(e.target.value))}
                />
              </label>

              <label className="field" style={{ minWidth: 180 }}>
                <span className="muted">reason</span>
                <select data-testid="add-hours-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  <option value="PURCHASE">PURCHASE</option>
                  <option value="ADJUSTMENT">ADJUSTMENT</option>
                </select>
              </label>

              <label className="field" style={{ minWidth: 260 }}>
                <span className="muted">teacher（可选）</span>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={teachers === null}>
                  <option value="">通用（不指定老师）</option>
                  {(teachers ?? []).map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.displayName ?? '—'} ({teacher.email ?? 'no-email'})
                    </option>
                  ))}
                </select>
              </label>

              <button className="btn" type="submit" disabled={loading} data-testid="add-hours-submit" style={{ alignSelf: 'flex-end' }}>
                {loading ? '提交中…' : '提交'}
              </button>
            </form>
          </div>

          <div className="card stack">
            <strong>课时流水（最近 50 条）</strong>
            {student.ledgerEntries.length === 0 ? (
              <div className="muted">暂无</div>
            ) : (
              <div className="stack">
                {student.ledgerEntries.map((entry) => (
                  <div key={entry.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {entry.deltaUnits > 0 ? '+' : ''}
                      {entry.deltaUnits} ({entry.reason})
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {entry.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
