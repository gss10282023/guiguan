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

function formatDateTime(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ');
}

function reasonLabel(reason: string): string {
  if (reason === 'PURCHASE') return '购买';
  if (reason === 'ADJUSTMENT') return '手动调整';
  if (reason === 'SESSION_CONSUME') return '上课消耗';
  return reason;
}

type StudentDetail = {
  id: string;
  email: string | null;
  displayName: string | null;
  timeZone: string | null;
  createdAt: string;
  remainingUnits: number;
  hoursByTeacher: {
    totalRemainingUnits: number;
    unassignedUnits: number;
    byTeacher: { teacherId: string; teacherName: string | null; remainingUnits: number }[];
  };
  ledgerEntries: {
    id: string;
    deltaUnits: number;
    reason: string;
    sessionId: string | null;
    teacherId: string | null;
    teacherName: string | null;
    createdAt: string;
  }[];
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

  const [hoursAction, setHoursAction] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [deltaUnits, setDeltaUnits] = useState(5);
  const [reason, setReason] = useState<'PURCHASE' | 'ADJUSTMENT'>('PURCHASE');
  const [teacherId, setTeacherId] = useState<string>('');

  const [ledgerTeacherFilter, setLedgerTeacherFilter] = useState<'ALL' | 'UNASSIGNED' | string>('ALL');

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

  const selectedTeacher =
    teacherId && teachers ? teachers.find((t) => t.id === teacherId) ?? null : null;
  const selectedTeacherLabel = teacherId ? selectedTeacher?.displayName ?? selectedTeacher?.email ?? teacherId : '通用（不指定老师）';

  const totalRemainingUnits = student?.remainingUnits ?? 0;
  const unassignedUnits = student?.hoursByTeacher.unassignedUnits ?? 0;
  const teacherAssignedUnits = Math.max(
    0,
    (student?.hoursByTeacher.byTeacher ?? []).reduce((acc, item) => acc + item.remainingUnits, 0),
  );

  const filteredLedgerEntries =
    student?.ledgerEntries.filter((entry) => {
      if (ledgerTeacherFilter === 'ALL') return true;
      if (ledgerTeacherFilter === 'UNASSIGNED') return entry.teacherId === null;
      return entry.teacherId === ledgerTeacherFilter;
    }) ?? [];

  const hoursActionLabel = hoursAction === 'DEDUCT' ? '扣除' : '增加';
  const signedDeltaUnits = hoursAction === 'DEDUCT' ? -Math.abs(deltaUnits) : Math.abs(deltaUnits);

  return (
    <main className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btnSecondary" type="button" onClick={() => router.push('/students')}>
            返回
          </button>
          <h1 style={{ margin: 0 }}>学生详情</h1>
        </div>

        <button className="btnSecondary" type="button" onClick={() => void refresh()} disabled={!hydrated || !accessToken}>
          刷新
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div data-testid="student-detail-success">{success}</div> : null}

      {student === null ? (
        <div className="card muted">加载中…</div>
      ) : (
        <>
          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div className="stack" style={{ gap: 4 }}>
                <strong style={{ fontSize: 18 }}>{student.displayName ?? '—'}</strong>
                <span className="muted" style={{ fontSize: 13 }}>
                  {student.email ?? '—'}
                </span>
              </div>

              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  创建时间
                </span>
                <span style={{ fontSize: 13 }}>{formatDateTime(student.createdAt)}</span>
              </div>
            </div>

            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                学生ID：{student.id}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                时区：{student.timeZone ?? '—'}
              </span>
            </div>
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <strong>课时概览</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                总课时 = 通用课时 + 老师专属课时
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: '#f9fafb',
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>
                  总剩余课时
                </div>
                <div style={{ fontSize: 32, fontWeight: 800 }} data-testid="student-remaining-units">
                  {student.remainingUnits}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: '#f9fafb',
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>
                  通用课时（不指定老师）
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{unassignedUnits}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  用于任意老师；不绑定归属
                </div>
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: '#f9fafb',
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>
                  老师专属课时
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{teacherAssignedUnits}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  选择老师加课时，会计入该老师名下
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }} className="stack">
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <strong>拆分明细</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  拆分总和：{unassignedUnits + teacherAssignedUnits}（应等于总剩余课时）
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>
                  归属
                </div>
                <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                  剩余课时
                </div>

                <div style={{ fontWeight: 600 }}>通用（不指定老师）</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{unassignedUnits}</div>

                {student.hoursByTeacher.byTeacher.length === 0 ? (
                  <div className="muted" style={{ gridColumn: '1 / -1' }}>
                    暂无老师专属课时
                  </div>
                ) : (
                  student.hoursByTeacher.byTeacher.map((item) => (
                    <div
                      key={item.teacherId}
                      style={{
                        display: 'contents',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.teacherName ?? '未命名老师'}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {item.teacherId}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{item.remainingUnits}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <strong>课时调整</strong>
              <span className="muted" style={{ fontSize: 12 }}>
                将为「{selectedTeacherLabel}」{hoursActionLabel} {Math.abs(deltaUnits)} 课时
              </span>
            </div>

            <form
              className="row"
              style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setSuccess(null);

                if (!Number.isInteger(deltaUnits) || deltaUnits <= 0) {
                  setError('课时数量必须为正整数');
                  return;
                }

                setLoading(true);
                try {
                  const payload: { deltaUnits: number; reason: typeof reason; teacherId?: string } = {
                    deltaUnits: signedDeltaUnits,
                    reason,
                  };
                  if (teacherId) payload.teacherId = teacherId;

                  await apiFetchJson<{ id: string }>(`/admin/students/${student.id}/hours`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  setSuccess(hoursAction === 'DEDUCT' ? '已扣除课时' : '已增加课时');
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : '提交失败');
                } finally {
                  setLoading(false);
                }
              }}
            >
              <label className="field" style={{ minWidth: 180 }}>
                <span className="muted">操作</span>
                <select
                  value={hoursAction}
                  onChange={(e) => {
                    const next = e.target.value as typeof hoursAction;
                    setHoursAction(next);
                    if (next === 'DEDUCT' && reason === 'PURCHASE') setReason('ADJUSTMENT');
                  }}
                >
                  <option value="ADD">增加</option>
                  <option value="DEDUCT">扣除</option>
                </select>
              </label>

              <label className="field" style={{ minWidth: 180 }}>
                <span className="muted">数量（课时）</span>
                <input
                  data-testid="add-hours-deltaUnits"
                  type="number"
                  min={1}
                  step={1}
                  value={deltaUnits}
                  onChange={(e) => setDeltaUnits(Number(e.target.value))}
                />
              </label>

              <label className="field" style={{ minWidth: 200 }}>
                <span className="muted">原因</span>
                <select data-testid="add-hours-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  <option value="PURCHASE" disabled={hoursAction === 'DEDUCT'}>
                    购买
                  </option>
                  <option value="ADJUSTMENT">手动调整</option>
                </select>
              </label>

              <label className="field" style={{ minWidth: 280 }}>
                <span className="muted">归属老师（可选）</span>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={teachers === null}>
                  <option value="">通用（不指定老师）</option>
                  {(teachers ?? []).map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.displayName ?? '—'} ({teacher.email ?? 'no-email'})
                    </option>
                  ))}
                </select>
              </label>

              <button className="btn" type="submit" disabled={loading} data-testid="add-hours-submit">
                {loading ? '提交中…' : '提交'}
              </button>
            </form>

            <div className="muted" style={{ fontSize: 12 }}>
              不选老师则调整「通用课时」；选择老师则调整该老师名下的「专属课时」。
            </div>
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <strong>课时流水（最近 50 条）</strong>
              <label className="field" style={{ minWidth: 260 }}>
                <span className="muted">筛选老师</span>
                <select
                  data-testid="student-ledger-teacher-filter"
                  value={ledgerTeacherFilter}
                  onChange={(e) => setLedgerTeacherFilter(e.target.value as typeof ledgerTeacherFilter)}
                >
                  <option value="ALL">全部</option>
                  <option value="UNASSIGNED">通用（不指定老师）</option>
                  {student.hoursByTeacher.byTeacher.map((t) => (
                    <option key={t.teacherId} value={t.teacherId}>
                      {t.teacherName ?? t.teacherId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredLedgerEntries.length === 0 ? (
              <div className="muted">暂无</div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                  className="muted"
                >
                  <div style={{ fontSize: 12 }}>变动</div>
                  <div style={{ fontSize: 12 }}>说明</div>
                  <div style={{ fontSize: 12, textAlign: 'right' }}>时间</div>
                </div>

                {filteredLedgerEntries.map((entry) => {
                  const deltaColor = entry.deltaUnits > 0 ? '#16a34a' : entry.deltaUnits < 0 ? '#ef4444' : '#6b7280';
                  const teacherLabel = entry.teacherName ?? (entry.teacherId ? entry.teacherId : '通用（不指定老师）');

                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 1fr auto',
                        gap: 10,
                        alignItems: 'center',
                        borderTop: '1px solid #f3f4f6',
                        paddingTop: 10,
                      }}
                    >
                      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: deltaColor }}>
                        {entry.deltaUnits > 0 ? '+' : ''}
                        {entry.deltaUnits}
                      </div>

                      <div className="stack" style={{ gap: 2 }}>
                        <div style={{ fontWeight: 600 }}>
                          {reasonLabel(entry.reason)} · {teacherLabel}
                        </div>
                        {entry.sessionId ? (
                          <div className="muted" style={{ fontSize: 12 }}>
                            关联课程：{entry.sessionId}
                          </div>
                        ) : null}
                      </div>

                      <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                        {formatDateTime(entry.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card stack">
            <strong style={{ color: '#b91c1c' }}>危险操作</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              删除会禁用账号并从列表隐藏，通常不可恢复。
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
                {deleting ? '删除中…' : '删除学生'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
