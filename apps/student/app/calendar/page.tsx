'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { formatDateTimeInTimeZone, useApi } from '../_lib/api';
import { useRequireAuth } from '../_lib/auth';
import { useDisplayTimeZone } from '../_lib/display-timezone';

type SessionListItem = {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  classTimeZone: string;
  status: string;
  teacherName: string | null;
  studentName: string | null;
};

type YearMonth = { year: number; monthIndex: number };
type DateYMD = { year: number; monthIndex: number; day: number };

function formatMonthLabel(value: YearMonth): string {
  const date = new Date(Date.UTC(value.year, value.monthIndex, 1, 12));
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

function addMonths(value: YearMonth, months: number): YearMonth {
  const date = new Date(Date.UTC(value.year, value.monthIndex + months, 1, 12));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}

function addDays(value: DateYMD, days: number): DateYMD {
  const date = new Date(Date.UTC(value.year, value.monthIndex, value.day + days, 12));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth(), day: date.getUTCDate() };
}

function ymdToKey(value: DateYMD): string {
  const year = String(value.year);
  const month = String(value.monthIndex + 1).padStart(2, '0');
  const day = String(value.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ymdToUtcDate(value: DateYMD): Date {
  return new Date(Date.UTC(value.year, value.monthIndex, value.day, 0, 0, 0));
}

function buildMonthGrid(viewMonth: YearMonth): DateYMD[] {
  const firstOfMonth: DateYMD = { year: viewMonth.year, monthIndex: viewMonth.monthIndex, day: 1 };
  const dayOfWeek = new Date(Date.UTC(firstOfMonth.year, firstOfMonth.monthIndex, 1, 12)).getUTCDay(); // 0=Sun
  const offsetToMonday = (dayOfWeek + 6) % 7;
  const start = addDays(firstOfMonth, -offsetToMonday);

  const days: DateYMD[] = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(start, i));
  }
  return days;
}

function toDateKeyInTimeZone(value: string | Date, timeZone: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to format date key');
  }

  return `${year}-${month}-${day}`;
}

function getYearMonthInTimeZone(value: Date, timeZone: string): YearMonth {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(value);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  if (!year || !month) return { year: value.getFullYear(), monthIndex: value.getMonth() };
  return { year: Number(year), monthIndex: Number(month) - 1 };
}

export default function CalendarPage() {
  const { hydrated, accessToken } = useRequireAuth();
  const { apiFetchJson } = useApi();
  const { timeZone } = useDisplayTimeZone();

  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<YearMonth>(() => getYearMonthInTimeZone(new Date(), timeZone));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const viewMonthNumber = viewMonth.monthIndex;

  const query = useMemo(() => {
    const first = gridDays[0];
    const last = gridDays[gridDays.length - 1];
    if (!first || !last) return '';

    const start = addDays(first, -1);
    const end = addDays(last, 2);
    const from = ymdToUtcDate(start);
    const to = ymdToUtcDate(end);
    const search = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    return `?${search.toString()}`;
  }, [gridDays]);

  const sessionsByDateKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!sessions) return map;

    for (const session of sessions) {
      const key = toDateKeyInTimeZone(session.startAtUtc, timeZone);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions, timeZone]);

  const filteredSessions = useMemo<SessionListItem[]>(() => {
    if (!sessions) return [];
    if (!selectedDateKey) return sessions;
    return sessions.filter((session) => toDateKeyInTimeZone(session.startAtUtc, timeZone) === selectedDateKey);
  }, [selectedDateKey, sessions, timeZone]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const data = await apiFetchJson<SessionListItem[]>(`/student/sessions${query}`);
        if (!cancelled) setSessions(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiFetchJson, hydrated, query]);

  return (
    <main className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>课表</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          展示时间：{timeZone}（并标注课程时区）
        </span>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btnSecondary"
            onClick={() => {
              setViewMonth((prev) => addMonths(prev, -1));
              setSelectedDateKey(null);
              setSessions(null);
            }}
          >
            上月
          </button>

          <strong>{formatMonthLabel(viewMonth)}</strong>

          <button
            type="button"
            className="btnSecondary"
            onClick={() => {
              setViewMonth((prev) => addMonths(prev, 1));
              setSelectedDateKey(null);
              setSessions(null);
            }}
          >
            下月
          </button>
        </div>

        <div className="calendarWeekdays" aria-hidden="true">
          <div style={{ textAlign: 'center' }}>一</div>
          <div style={{ textAlign: 'center' }}>二</div>
          <div style={{ textAlign: 'center' }}>三</div>
          <div style={{ textAlign: 'center' }}>四</div>
          <div style={{ textAlign: 'center' }}>五</div>
          <div style={{ textAlign: 'center' }}>六</div>
          <div style={{ textAlign: 'center' }}>日</div>
        </div>

        <div className="calendarGrid">
          {gridDays.map((date) => {
            const inMonth = date.monthIndex === viewMonthNumber;
            const key = ymdToKey(date);
            const count = sessionsByDateKey.get(key) ?? 0;
            const selected = selectedDateKey === key;

            const className = [
              'calendarCell',
              inMonth ? '' : 'calendarCellOut',
              selected ? 'calendarCellSelected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={key}
                type="button"
                className={className}
                onClick={() => setSelectedDateKey(key)}
                aria-label={`${key}，${count ? `${count} 节课` : '无课程'}`}
              >
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12 }}>{date.day}</span>
                  {count ? <span className="calendarBadge">{count}</span> : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            点击日期筛选课程
          </span>
          {selectedDateKey ? (
            <button type="button" className="btnSecondary" onClick={() => setSelectedDateKey(null)}>
              清除筛选（{selectedDateKey}）
            </button>
          ) : null}
        </div>
      </div>

      {sessions === null ? (
        <div className="muted">加载中…</div>
      ) : filteredSessions.length === 0 ? (
        <div className="card muted">暂无课程</div>
      ) : (
        <div className="stack" data-testid="session-list">
          {filteredSessions.map((session) => (
            <Link
              key={session.id}
              href={`/session/${session.id}`}
              className="card"
              data-testid="session-item"
              style={{ display: 'block' }}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{formatDateTimeInTimeZone(session.startAtUtc, timeZone)}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {session.status}
                </span>
              </div>

              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                课程时区：{session.classTimeZone}
              </div>

              <div style={{ marginTop: 8, fontSize: 13 }}>
                老师：{session.teacherName ?? '—'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
