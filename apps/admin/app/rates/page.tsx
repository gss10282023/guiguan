'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApi } from '../_lib/api';
import { useRequireAdmin } from '../_lib/auth';

type UserOption = {
  id: string;
  email: string | null;
  displayName: string | null;
};

type Currency = 'AUD' | 'CNY' | 'USD';
type Subject =
  | 'GENERAL'
  | 'ENGLISH'
  | 'CHINESE'
  | 'MATHEMATICS'
  | 'CHEMISTRY'
  | 'PHYSICS'
  | 'BIOLOGY'
  | 'ECONOMICS'
  | 'BUSINESS_STUDIES'
  | 'LEGAL_STUDIES'
  | 'MODERN_HISTORY'
  | 'ANCIENT_HISTORY'
  | 'GEOGRAPHY';

type RateListItem = {
  id: string;
  teacherId: string;
  teacherName: string | null;
  teacherEmail: string | null;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  subject: Subject;
  hourlyRateCents: number;
  currency: Currency;
  updatedAt: string;
};

const SUBJECT_OPTIONS: { value: Subject; label: string }[] = [
  { value: 'GENERAL', label: '通用' },
  { value: 'ENGLISH', label: 'English（英语）' },
  { value: 'MATHEMATICS', label: 'Mathematics（数学）' },
  { value: 'CHINESE', label: 'Chinese（中文）' },
  { value: 'CHEMISTRY', label: 'Chemistry（化学）' },
  { value: 'PHYSICS', label: 'Physics（物理）' },
  { value: 'BIOLOGY', label: 'Biology（生物）' },
  { value: 'ECONOMICS', label: 'Economics（经济）' },
  { value: 'BUSINESS_STUDIES', label: 'Business Studies（商科）' },
  { value: 'LEGAL_STUDIES', label: 'Legal Studies（法律）' },
  { value: 'MODERN_HISTORY', label: 'Modern History（现代史）' },
  { value: 'ANCIENT_HISTORY', label: 'Ancient History（古代史）' },
  { value: 'GEOGRAPHY', label: 'Geography（地理）' },
];

export default function RatesPage() {
  const { hydrated, accessToken } = useRequireAdmin();
  const { apiFetchJson } = useApi();

  const [teachers, setTeachers] = useState<UserOption[] | null>(null);
  const [students, setStudents] = useState<UserOption[] | null>(null);
  const [rates, setRates] = useState<RateListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState<Subject>('GENERAL');
  const [hourlyRateCents, setHourlyRateCents] = useState(10000);
  const [currency, setCurrency] = useState<Currency>('AUD');

  const refreshRates = useCallback(async () => {
    const data = await apiFetchJson<RateListItem[]>('/admin/rates');
    setRates(data);
  }, [apiFetchJson]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const [teachersRes, studentsRes] = await Promise.all([
          apiFetchJson<UserOption[]>('/admin/teachers'),
          apiFetchJson<UserOption[]>('/admin/students'),
        ]);
        if (cancelled) return;

        setTeachers(teachersRes);
        setStudents(studentsRes);
        setTeacherId(teachersRes[0]?.id ?? '');
        setStudentId(studentsRes[0]?.id ?? '');

        await refreshRates();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiFetchJson, hydrated, refreshRates]);

  const teacherLabel = useMemo(() => {
    const teacher = teachers?.find((t) => t.id === teacherId);
    if (!teacher) return '';
    return `${teacher.displayName ?? '—'} (${teacher.email ?? 'no-email'})`;
  }, [teacherId, teachers]);

  const studentLabel = useMemo(() => {
    const student = students?.find((s) => s.id === studentId);
    if (!student) return '';
    return `${student.displayName ?? '—'} (${student.email ?? 'no-email'})`;
  }, [studentId, students]);

  return (
    <main className="stack">
      <h1 style={{ margin: 0 }}>费率</h1>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div data-testid="rate-success">{success}</div> : null}

      {teachers === null || students === null ? (
        <div className="card muted">加载中…</div>
      ) : (
        <>
          <div className="card stack">
            <strong>设置老师-学生小时费率</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              当前：{teacherLabel} → {studentLabel}
            </div>

            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setSuccess(null);

                if (!teacherId || !studentId) {
                  setError('请选择老师与学生');
                  return;
                }

                if (!Number.isFinite(hourlyRateCents) || hourlyRateCents <= 0) {
                  setError('hourlyRateCents 必须为正整数');
                  return;
                }

                setSubmitting(true);
                try {
                await apiFetchJson('/admin/rates', {
                  method: 'PUT',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ teacherId, studentId, subject, hourlyRateCents, currency }),
                });
                setSuccess('已保存费率');
                await refreshRates();
              } catch (err) {
                  setError(err instanceof Error ? err.message : '保存失败');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="field">
                <span className="muted">老师</span>
                <select data-testid="rate-teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.displayName ?? '—'} ({teacher.email ?? 'no-email'})
                    </option>
                  ))}
                </select>
              </label>

            <label className="field">
              <span className="muted">学生</span>
              <select data-testid="rate-studentId" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.displayName ?? '—'} ({student.email ?? 'no-email'})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="muted">subject</span>
              <select data-testid="rate-subject" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                {SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="muted">hourlyRateCents</span>
              <input
                data-testid="rate-hourlyRateCents"
                  type="number"
                  min={1}
                  step={1}
                  value={hourlyRateCents}
                  onChange={(e) => setHourlyRateCents(Number(e.target.value))}
                />
              </label>

              <label className="field">
                <span className="muted">currency</span>
                <select data-testid="rate-currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option value="AUD">AUD</option>
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <button className="btn" type="submit" disabled={submitting} data-testid="rate-submit">
                {submitting ? '保存中…' : '保存'}
              </button>
            </form>
          </div>

          <div className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>已创建费率</strong>
              <button className="btnSecondary" type="button" onClick={() => void refreshRates()} disabled={rates === null}>
                刷新
              </button>
            </div>

            {rates === null ? (
              <div className="muted">加载中…</div>
            ) : rates.length === 0 ? (
              <div className="muted">暂无费率</div>
            ) : (
              <div className="stack" data-testid="rate-list">
                {rates.map((rate) => (
                  <div key={rate.id} className="card stack" data-testid="rate-item">
                    <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{rate.teacherName ?? rate.teacherId}</strong>
                        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                          {rate.teacherEmail ?? 'no-email'}
                        </span>
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {rate.updatedAt.slice(0, 19).replace('T', ' ')}
                      </span>
                    </div>

                    <div className="muted" style={{ fontSize: 13 }}>
                      学生：{rate.studentName ?? rate.studentId}（{rate.studentEmail ?? 'no-email'}）
                    </div>

                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <div>
                        <span className="muted">科目：</span>
                        <strong>{SUBJECT_OPTIONS.find((opt) => opt.value === rate.subject)?.label ?? rate.subject}</strong>
                      </div>
                    </div>

                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <div>
                        <span className="muted">费率：</span>
                        <strong>
                          {rate.currency} {rate.hourlyRateCents}
                        </strong>
                        <span className="muted" style={{ marginLeft: 6 }}>
                          / hour
                        </span>
                      </div>

                      <button
                        className="btnSecondary"
                        type="button"
                        onClick={() => {
                          setSuccess(null);
                          setError(null);
                          setTeacherId(rate.teacherId);
                          setStudentId(rate.studentId);
                          setSubject(rate.subject);
                          setHourlyRateCents(rate.hourlyRateCents);
                          setCurrency(rate.currency);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        data-testid="rate-edit"
                      >
                        编辑
                      </button>

                      <button
                        className="btnDanger"
                        type="button"
                        onClick={async () => {
                          setError(null);
                          setSuccess(null);
                          if (!window.confirm('确认删除该费率吗？')) return;
                          setDeletingId(rate.id);
                          try {
                            await apiFetchJson(`/admin/rates/${rate.id}`, { method: 'DELETE' });
                            await refreshRates();
                            setSuccess('已删除费率');
                          } catch (err) {
                            setError(err instanceof Error ? err.message : '删除失败');
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                        disabled={deletingId !== null}
                        data-testid="rate-delete"
                      >
                        {deletingId === rate.id ? '删除中…' : '删除'}
                      </button>
                    </div>
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
