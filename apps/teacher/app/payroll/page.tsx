'use client';

import { useEffect, useMemo, useState } from 'react';

import { useApi } from '../_lib/api';
import { useRequireAuth } from '../_lib/auth';

type PayrollTotal = {
  currency: string;
  totalCents: number;
  totalHours: number;
  sessionsCount: number;
};

type StudentPayroll = {
  studentId: string;
  studentName: string | null;
  totals: PayrollTotal[];
};

type PayrollResponse = {
  weekStartLocal: string;
  weekEndLocal: string;
  totals: PayrollTotal[];
  byStudent: StudentPayroll[];
};

const PAYROLL_TIME_ZONE = 'Australia/Sydney';

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid date');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addDaysIsoDate(isoDate: string, deltaDays: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function isoDateToUtcMidday(isoDate: string): Date {
  const { year, month, day } = parseIsoDate(isoDate);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatIsoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) throw new Error('Failed to format date');
  return `${year}-${month}-${day}`;
}

function getSydneyWeekStart(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: PAYROLL_TIME_ZONE, weekday: 'short' }).format(date);
  const offset =
    weekday === 'Mon'
      ? 0
      : weekday === 'Tue'
        ? 1
        : weekday === 'Wed'
          ? 2
          : weekday === 'Thu'
            ? 3
            : weekday === 'Fri'
              ? 4
              : weekday === 'Sat'
                ? 5
                : 6;

  const todayLocal = formatIsoDateInTimeZone(date, PAYROLL_TIME_ZONE);
  return addDaysIsoDate(todayLocal, -offset);
}

function formatCurrency(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function PayrollPage() {
  const { hydrated, accessToken } = useRequireAuth();
  const { apiFetchJson } = useApi();

  const defaultAnchorDate = useMemo(() => getSydneyWeekStart(new Date()), []);
  const [anchorDate, setAnchorDate] = useState(defaultAnchorDate);
  const weekStart = useMemo(() => getSydneyWeekStart(isoDateToUtcMidday(anchorDate)), [anchorDate]);

  const [data, setData] = useState<PayrollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const res = await apiFetchJson<PayrollResponse>(`/teacher/payroll?weekStart=${weekStart}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiFetchJson, hydrated, weekStart]);

  return (
    <main className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>周工资</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          ⓘ 统计口径：{PAYROLL_TIME_ZONE}（周一到周日）
        </span>
      </div>

      <div className="card stack" style={{ maxWidth: 520 }}>
        <label className="field" style={{ maxWidth: 260 }}>
          <span className="muted">选择日期（自动按周统计）</span>
          <input
            data-testid="payroll-weekstart"
            type="date"
            value={anchorDate}
            onChange={(e) => {
              if (!e.target.value) return;
              setAnchorDate(e.target.value);
            }}
          />
        </label>

        <div className="muted" style={{ fontSize: 12 }}>
          按周统计（周一~周日），已自动对齐到周一：{weekStart}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button
            className="btnSecondary"
            type="button"
            onClick={() => setAnchorDate((prev) => addDaysIsoDate(prev, -7))}
          >
            上一周
          </button>
          <button className="btnSecondary" type="button" onClick={() => setAnchorDate((prev) => addDaysIsoDate(prev, 7))}>
            下一周
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {data === null ? (
        <div className="muted">加载中…</div>
      ) : (
        <div className="stack">
          <div className="card" data-testid="payroll-week-range">
            <div className="muted" style={{ fontSize: 12 }}>
              区间（Sydney）
            </div>
            <div style={{ marginTop: 8 }}>
              <strong>
                {data.weekStartLocal} ~ {data.weekEndLocal}
              </strong>
            </div>
          </div>

          {data.totals.length === 0 ? (
            <div className="card muted" data-testid="payroll-totals">
              本周暂无已完成课程
            </div>
          ) : (
            <>
              <div className="stack" data-testid="payroll-totals">
                {data.totals.map((t) => (
                  <div key={t.currency} className="card">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{t.currency} 总计</strong>
                      <span>{formatCurrency(t.totalCents, t.currency)}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                      {t.sessionsCount} 节课 · {t.totalHours.toFixed(2)} 小时
                    </div>
                  </div>
                ))}
              </div>

              <div className="stack" data-testid="payroll-by-student">
                <strong>按学生拆分</strong>

                {data.byStudent.length === 0 ? (
                  <div className="card muted">暂无学生明细</div>
                ) : (
                  <div className="stack">
                    {data.byStudent.map((student) => (
                      <div key={student.studentId} className="card stack">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <strong>{student.studentName ?? student.studentId}</strong>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {student.totals.reduce((acc, t) => acc + t.sessionsCount, 0)} 节课
                          </span>
                        </div>

                        {student.totals.map((t) => (
                          <div key={t.currency} className="row" style={{ justifyContent: 'space-between' }}>
                            <span className="muted">{t.currency}</span>
                            <span>{formatCurrency(t.totalCents, t.currency)}</span>
                          </div>
                        ))}

                        <div className="muted" style={{ fontSize: 13 }}>
                          {student.totals.reduce((acc, t) => acc + t.totalHours, 0).toFixed(2)} 小时（各币种小时数汇总）
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
