'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApi } from '../_lib/api';
import { useRequireAdmin } from '../_lib/auth';

type UserOption = {
  id: string;
  email: string | null;
  displayName: string | null;
};

type Currency = 'AUD' | 'CNY' | 'USD';
type SessionStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
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

type AdminSessionListItem = {
  id: string;
  teacherId: string;
  teacherName: string | null;
  teacherEmail: string | null;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  subject: Subject;
  startAtUtc: string;
  endAtUtc: string;
  classTimeZone: string;
  status: SessionStatus;
  consumesUnits: number;
  studentHourlyRateCentsSnapshot: number;
  teacherHourlyWageCentsSnapshot: number;
  currencySnapshot: Currency;
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

function formatDateTimeInTimeZone(value: string | Date, timeZone: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function subjectLabel(subject: Subject): string {
  return SUBJECT_OPTIONS.find((opt) => opt.value === subject)?.label ?? subject;
}

function statusBadgeClass(status: SessionStatus): string {
  if (status === 'COMPLETED') return 'statusBadgeCompleted';
  if (status === 'CANCELLED') return 'statusBadgeCancelled';
  return 'statusBadgeScheduled';
}

function sessionCardStatusClass(status: SessionStatus): string {
  if (status === 'COMPLETED') return 'sessionCardStatusCompleted';
  if (status === 'CANCELLED') return 'sessionCardStatusCancelled';
  return 'sessionCardStatusScheduled';
}

function daySessionChipStatusClass(status: SessionStatus): string {
  if (status === 'COMPLETED') return 'daySessionChipCompleted';
  if (status === 'CANCELLED') return 'daySessionChipCancelled';
  return '';
}

function parseDateKey(key: string): DateYMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1, day: Number(match[3]) };
}

function formatTimeInTimeZone(value: string | Date, timeZone: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date);
}

function getHourMinuteInTimeZone(value: string | Date, timeZone: string): { hour: number; minute: number } {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  if (!hour || !minute) throw new Error('Failed to parse hour/minute');
  return { hour: Number(hour), minute: Number(minute) };
}

function toSlotLabelInTimeZone(value: string | Date, timeZone: string, slotMinutes: number): string {
  const { hour, minute } = getHourMinuteInTimeZone(value, timeZone);
  const bucketMinute = Math.floor(minute / slotMinutes) * slotMinutes;
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(hour)}:${pad(bucketMinute)}`;
}

function startOfLocalMinute(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function buildLocalDateAt(date: DateYMD, hour: number, minute: number): Date {
  return new Date(date.year, date.monthIndex, date.day, hour, minute, 0, 0);
}

export default function SessionsPage() {
  const { hydrated, accessToken } = useRequireAdmin();
  const { apiFetchJson } = useApi();

  const [teachers, setTeachers] = useState<UserOption[] | null>(null);
  const [students, setStudents] = useState<UserOption[] | null>(null);

  const [mode, setMode] = useState<'TEACHER' | 'STUDENT'>('TEACHER');
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SessionStatus>('SCHEDULED');

  const [sessions, setSessions] = useState<AdminSessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const displayTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [viewMonth, setViewMonth] = useState<YearMonth>(() => getYearMonthInTimeZone(new Date(), displayTimeZone));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [subject, setSubject] = useState<Subject>('GENERAL');
  const [startAtLocal, setStartAtLocal] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const [endAtLocal, setEndAtLocal] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)));
  const [classTimeZone, setClassTimeZone] = useState('Australia/Sydney');
  const [consumesUnits, setConsumesUnits] = useState(1);

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

    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (mode === 'TEACHER' && teacherId) params.set('teacherId', teacherId);
    if (mode === 'STUDENT' && studentId) params.set('studentId', studentId);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    return `?${params.toString()}`;
  }, [gridDays, mode, statusFilter, studentId, teacherId]);

  const refreshSessions = useCallback(async () => {
    const data = await apiFetchJson<AdminSessionListItem[]>(`/admin/sessions${query}`);
    setSessions(data);
  }, [apiFetchJson, query]);

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
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, apiFetchJson, hydrated]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    if (mode === 'TEACHER' && !teacherId) return;
    if (mode === 'STUDENT' && !studentId) return;

    void refreshSessions().catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, [accessToken, hydrated, mode, refreshSessions, studentId, teacherId]);

  const sessionsByDateKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!sessions) return map;

    for (const session of sessions) {
      const key = toDateKeyInTimeZone(session.startAtUtc, displayTimeZone);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [displayTimeZone, sessions]);

  const filteredSessions = useMemo<AdminSessionListItem[]>(() => {
    if (!sessions) return [];
    if (!selectedDateKey) return sessions;
    return sessions.filter((session) => toDateKeyInTimeZone(session.startAtUtc, displayTimeZone) === selectedDateKey);
  }, [displayTimeZone, selectedDateKey, sessions]);

  const modeLabel = useMemo(() => {
    if (mode === 'TEACHER') return '老师课表';
    return '学生课表';
  }, [mode]);

  const activeDateKey = useMemo(() => selectedDateKey ?? toDateKeyInTimeZone(new Date(), displayTimeZone), [displayTimeZone, selectedDateKey]);
  const activeDate = useMemo(() => parseDateKey(activeDateKey), [activeDateKey]);
  const daySessions = useMemo(() => {
    return filteredSessions.filter((session) => toDateKeyInTimeZone(session.startAtUtc, displayTimeZone) === activeDateKey);
  }, [activeDateKey, displayTimeZone, filteredSessions]);

  const sessionsByStartTime = useMemo(() => {
    const map = new Map<string, AdminSessionListItem[]>();
    for (const session of daySessions) {
      const label = toSlotLabelInTimeZone(session.startAtUtc, displayTimeZone, 30);
      const list = map.get(label) ?? [];
      list.push(session);
      map.set(label, list);
    }
    return map;
  }, [daySessions, displayTimeZone]);

  const openCreateModalAt = useCallback(
    (date: Date) => {
      setError(null);
      setSuccess(null);
      setEditingSessionId(null);

      const start = startOfLocalMinute(date);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setStartAtLocal(toDateTimeLocalValue(start));
      setEndAtLocal(toDateTimeLocalValue(end));
      setModalOpen(true);
    },
    [setEndAtLocal, setStartAtLocal],
  );

  const openEditModal = useCallback((session: AdminSessionListItem) => {
    setError(null);
    setSuccess(null);
    setEditingSessionId(session.id);
    setSubject(session.subject);
    setStartAtLocal(toDateTimeLocalValue(new Date(session.startAtUtc)));
    setEndAtLocal(toDateTimeLocalValue(new Date(session.endAtUtc)));
    setClassTimeZone(session.classTimeZone);
    setConsumesUnits(session.consumesUnits);
    setModalOpen(true);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modalOpen && !dialog.open) dialog.showModal();
    if (!modalOpen && dialog.open) dialog.close();
  }, [modalOpen]);

  return (
    <main className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>排课</h1>
        <span className="muted" style={{ fontSize: 12 }}>
          视图：{modeLabel} · 展示时区：{displayTimeZone}
        </span>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {success ? (
        <div className="success" data-testid="session-success">
          {success}
        </div>
      ) : null}

      {teachers === null || students === null ? (
        <div className="card muted">加载中…</div>
      ) : (
        <div className="card stack">
          <strong>课表视图</strong>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="field" style={{ minWidth: 180 }}>
              <span className="muted">视角</span>
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as typeof mode);
                  setSelectedDateKey(null);
                  setSessions(null);
                }}
              >
                <option value="TEACHER">按老师</option>
                <option value="STUDENT">按学生</option>
              </select>
            </label>

            <label className="field" style={{ minWidth: 320 }}>
              <span className="muted">{mode === 'TEACHER' ? '老师' : '学生'}</span>
              {mode === 'TEACHER' ? (
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName ?? '—'} ({t.email ?? 'no-email'})
                    </option>
                  ))}
                </select>
              ) : (
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName ?? '—'} ({s.email ?? 'no-email'})
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="field" style={{ minWidth: 200 }}>
              <span className="muted">状态</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setSelectedDateKey(null);
                  setSessions(null);
                }}
              >
                <option value="SCHEDULED">仅显示：SCHEDULED</option>
                <option value="ALL">显示：全部</option>
                <option value="CANCELLED">仅显示：CANCELLED</option>
                <option value="COMPLETED">仅显示：COMPLETED</option>
              </select>
            </label>

            <button
              className="btnSecondary btnSm"
              type="button"
              onClick={() => void refreshSessions()}
              disabled={sessions === null}
            >
              刷新
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            说明：这里的“删除课程”实际是“取消课程”（状态变为 CANCELLED），默认筛选只显示 SCHEDULED，所以取消后会从列表消失；切换到“显示全部”可查看。
          </div>
        </div>
      )}

      <div className="splitGridWide">
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

              const className = ['calendarCell', inMonth ? '' : 'calendarCellOut', selected ? 'calendarCellSelected' : '']
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

        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <strong>日视图（{activeDateKey}）</strong>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const base = buildLocalDateAt(activeDate, 9, 0);
                  openCreateModalAt(base);
                }}
              >
                创建课程
              </button>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            点击下面任意时间段可快速创建；课程展示时区：{displayTimeZone}
          </div>

          <div className="daySchedule" role="grid" aria-label="按天时间段">
            {Array.from({ length: 24 }).map((_, hour) => {
              const slots: { minute: number; label: string }[] = [
                { minute: 0, label: `${String(hour).padStart(2, '0')}:00` },
                { minute: 30, label: `${String(hour).padStart(2, '0')}:30` },
              ];
              return (
                <div key={hour} className="dayHourRow">
                  <div className="dayHourLabel">{String(hour).padStart(2, '0')}:00</div>
                  <div className="dayHourSlots">
                    {slots.map((slot) => {
                      const date = buildLocalDateAt(activeDate, hour, slot.minute);
                      const started = sessionsByStartTime.get(slot.label) ?? [];
                      return (
                        <button
                          key={slot.label}
                          type="button"
                          className="daySlot"
                          onClick={() => openCreateModalAt(date)}
                          aria-label={`创建课程 ${activeDateKey} ${slot.label}`}
                        >
                          <span className="daySlotTime">{slot.label}</span>
                          <span className="daySlotItems">
                            {started.length ? (
                              started.map((s) => (
                                <span
                                  key={s.id}
                                  className={`daySessionChip ${daySessionChipStatusClass(s.status)}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (s.status !== 'SCHEDULED') return;
                                    openEditModal(s);
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key !== 'Enter' && e.key !== ' ') return;
                                    e.preventDefault();
                                    if (s.status !== 'SCHEDULED') return;
                                    openEditModal(s);
                                  }}
                                  aria-label={`编辑课程 ${s.id}`}
                                >
                                  {subjectLabel(s.subject)} · {formatTimeInTimeZone(s.startAtUtc, displayTimeZone)}-
                                  {formatTimeInTimeZone(s.endAtUtc, displayTimeZone)}
                                </span>
                              ))
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>
                                —
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="modalDialog"
        onCancel={(e) => {
          e.preventDefault();
          setModalOpen(false);
          setEditingSessionId(null);
        }}
      >
        <form
          className="stack"
          method="dialog"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setSuccess(null);

            if (!teacherId || !studentId) {
              setError('请选择老师与学生');
              return;
            }

            const startAtUtc = new Date(startAtLocal);
            const endAtUtc = new Date(endAtLocal);

            if (!Number.isFinite(startAtUtc.getTime()) || !Number.isFinite(endAtUtc.getTime())) {
              setError('请输入有效的开始/结束时间');
              return;
            }

            if (endAtUtc <= startAtUtc) {
              setError('结束时间必须晚于开始时间');
              return;
            }

            setSubmitting(true);
            try {
              if (editingSessionId) {
                await apiFetchJson(`/admin/sessions/${editingSessionId}`, {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    subject,
                    startAtUtc: startAtUtc.toISOString(),
                    endAtUtc: endAtUtc.toISOString(),
                    classTimeZone,
                    consumesUnits,
                  }),
                });
                setSuccess('已保存修改');
                setEditingSessionId(null);
              } else {
                const created = await apiFetchJson<{ id: string }>('/admin/sessions', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    teacherId,
                    studentId,
                    subject,
                    startAtUtc: startAtUtc.toISOString(),
                    endAtUtc: endAtUtc.toISOString(),
                    classTimeZone,
                    consumesUnits,
                  }),
                });
                setSuccess(`已创建 session：${created.id}`);
              }

              await refreshSessions();
              setModalOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : editingSessionId ? '保存失败' : '创建失败');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <strong>{editingSessionId ? '编辑课程' : '创建课程'}</strong>
            <button
              type="button"
              className="btnSecondary btnSm"
              onClick={() => {
                setModalOpen(false);
                setEditingSessionId(null);
              }}
            >
              关闭
            </button>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="field" style={{ minWidth: 320 }}>
              <span className="muted">老师</span>
              <select data-testid="session-teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!!editingSessionId}>
                {teachers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName ?? '—'} ({t.email ?? 'no-email'})
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ minWidth: 320 }}>
              <span className="muted">学生</span>
              <select data-testid="session-studentId" value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!!editingSessionId}>
                {students?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName ?? '—'} ({s.email ?? 'no-email'})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="muted">科目</span>
            <select data-testid="session-subject" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="field" style={{ minWidth: 240 }}>
              <span className="muted">开始时间（本地）</span>
              <input data-testid="session-startAt" type="datetime-local" value={startAtLocal} onChange={(e) => setStartAtLocal(e.target.value)} />
            </label>

            <label className="field" style={{ minWidth: 240 }}>
              <span className="muted">结束时间（本地）</span>
              <input data-testid="session-endAt" type="datetime-local" value={endAtLocal} onChange={(e) => setEndAtLocal(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="muted">课程时区（IANA）</span>
            <input data-testid="session-timeZone" value={classTimeZone} onChange={(e) => setClassTimeZone(e.target.value)} />
          </label>

          <label className="field">
            <span className="muted">consumesUnits</span>
            <input
              data-testid="session-consumesUnits"
              type="number"
              min={1}
              step={1}
              value={consumesUnits}
              onChange={(e) => setConsumesUnits(Number(e.target.value))}
            />
          </label>

          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={submitting} data-testid="session-submit">
              {submitting ? (editingSessionId ? '保存中…' : '创建中…') : editingSessionId ? '保存修改' : '创建'}
            </button>
          </div>
        </form>
      </dialog>

      {sessions === null ? (
        <div className="muted">加载中…</div>
      ) : filteredSessions.length === 0 ? (
        <div className="card muted">暂无课程</div>
      ) : (
        <div className="stack" data-testid="session-list">
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className={`card stack ${sessionCardStatusClass(session.status)}`}
              data-testid="session-item"
            >
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <strong>{formatDateTimeInTimeZone(session.startAtUtc, displayTimeZone)}</strong>
                <span className={`statusBadge ${statusBadgeClass(session.status)}`}>{session.status}</span>
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                科目：{subjectLabel(session.subject)} · 课程时区：{session.classTimeZone} · consumesUnits：{session.consumesUnits}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                老师：{session.teacherName ?? '—'}（{session.teacherEmail ?? '—'}）
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                学生：{session.studentName ?? '—'}（{session.studentEmail ?? '—'}）
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  className="btnSecondary"
                  type="button"
                  onClick={async () => {
                    setError(null);
                    setSuccess(null);
                    if (!window.confirm('确认将该课程标记为 COMPLETED 吗？（将扣除学生课时）')) return;
                    setCompletingId(session.id);
                    try {
                      await apiFetchJson(`/admin/sessions/${session.id}`, {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ status: 'COMPLETED' }),
                      });
                      await refreshSessions();
                      setSuccess('已标记为 COMPLETED');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '标记失败');
                    } finally {
                      setCompletingId(null);
                    }
                  }}
                  disabled={session.status !== 'SCHEDULED' || completingId !== null || deletingId !== null}
                  data-testid="session-complete"
                >
                  {completingId === session.id ? '完成中…' : '标记完成'}
                </button>

                <button
                  className="btnSecondary"
                  type="button"
                  onClick={() => openEditModal(session)}
                  disabled={session.status !== 'SCHEDULED'}
                  data-testid="session-edit"
                >
                  编辑
                </button>

                <button
                  className="btnDanger"
                  type="button"
                  onClick={async () => {
                    setError(null);
                    setSuccess(null);
                    if (!window.confirm('确认删除该课程吗？（将会取消该课程）')) return;
                    setDeletingId(session.id);
                    try {
                      await apiFetchJson(`/admin/sessions/${session.id}`, { method: 'DELETE' });
                      await refreshSessions();
                      setSuccess('已删除课程');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '删除失败');
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  disabled={deletingId !== null || session.status === 'COMPLETED'}
                  data-testid="session-delete"
                >
                  {deletingId === session.id ? '删除中…' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
