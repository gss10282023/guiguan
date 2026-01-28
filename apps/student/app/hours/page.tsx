'use client';

import { useEffect, useState } from 'react';

import { useApi } from '../_lib/api';
import { useRequireAuth } from '../_lib/auth';

type HoursByTeacherResponse = {
  totalRemainingUnits: number;
  unassignedUnits: number;
  byTeacher: { teacherId: string; teacherName: string | null; remainingUnits: number }[];
};

export default function HoursPage() {
  const { hydrated, accessToken } = useRequireAuth();
  const { apiFetchJson } = useApi();

  const [summary, setSummary] = useState<HoursByTeacherResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const data = await apiFetchJson<HoursByTeacherResponse>('/student/hours/by-teacher');
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiFetchJson, hydrated]);

  return (
    <main className="stack">
      <h1 style={{ margin: 0 }}>剩余课时</h1>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="muted" style={{ fontSize: 12 }}>
          remainingUnits
        </div>
        <div style={{ fontSize: 32, fontWeight: 700 }} data-testid="remaining-units">
          {summary === null ? '…' : summary.totalRemainingUnits}
        </div>
      </div>

      {summary ? (
        <div className="card stack">
          <strong>按老师拆分</strong>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>通用课时（未分配老师）</span>
            <strong>{summary.unassignedUnits}</strong>
          </div>

          {summary.byTeacher.length === 0 ? (
            <div className="muted">暂无老师课时</div>
          ) : (
            <div className="stack">
              {summary.byTeacher.map((item) => (
                <div key={item.teacherId} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{item.teacherName ?? item.teacherId}</span>
                  <strong>{item.remainingUnits}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
