'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { formatDateTimeInTimeZone, useApi } from '../../_lib/api';
import { useRequireAuth } from '../../_lib/auth';
import { useDisplayTimeZone } from '../../_lib/display-timezone';

type SessionListItem = {
  id: string;
  startAtUtc: string;
  endAtUtc: string;
  classTimeZone: string;
  status: string;
  teacherName: string | null;
  studentName: string | null;
};

type ChangeRequestResponse = {
  id: string;
  sessionId: string;
  type: string;
  status: string;
};

function canCreateChangeRequest(startAtUtcIso: string): boolean {
  const startAtUtc = new Date(startAtUtcIso).getTime();
  const cutoffUtc = startAtUtc - 24 * 60 * 60 * 1000;
  return Date.now() < cutoffUtc;
}

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { hydrated, accessToken } = useRequireAuth();
  const { apiFetchJson } = useApi();
  const { timeZone } = useDisplayTimeZone();

  const [session, setSession] = useState<SessionListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const canRequest = useMemo(() => (session ? canCreateChangeRequest(session.startAtUtc) : false), [session]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const sessions = await apiFetchJson<SessionListItem[]>('/student/sessions');
        const found = sessions.find((s) => s.id === params.id) ?? null;
        if (!cancelled) setSession(found);
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
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>课程详情</h1>
        <button className="btnSecondary" type="button" onClick={() => router.back()}>
          返回
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {session === null ? (
        <div className="card muted">未找到课程（可能已被取消或无权限）</div>
      ) : (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{formatDateTimeInTimeZone(session.startAtUtc, timeZone)}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {session.status}
            </span>
          </div>

          <div className="muted">展示时区：{timeZone}</div>
          <div className="muted">课程时区：{session.classTimeZone}</div>
          <div>老师：{session.teacherName ?? '—'}</div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              className="btnDanger"
              type="button"
              disabled={!canRequest || submitting}
              onClick={async () => {
                setSubmitError(null);
                setSuccess(null);
                setSubmitting(true);
                try {
                  const data = await apiFetchJson<ChangeRequestResponse>(`/student/sessions/${session.id}/change-requests`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ type: 'CANCEL' }),
                  });
                  setSuccess(`已提交申请（${data.type}/${data.status}）`);
                } catch (err) {
                  setSubmitError(err instanceof Error ? err.message : '提交失败');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              申请取消
            </button>

            <Link className={`btnSecondary`} href="#" aria-disabled={!canRequest} onClick={(e) => e.preventDefault()}>
              申请改期（后续完善）
            </Link>
          </div>

          {!canRequest ? <div className="muted">距离开课不足 24 小时，无法发起改期/取消。</div> : null}
          {submitError ? <div className="error">{submitError}</div> : null}
          {success ? <div>{success}</div> : null}
        </div>
      )}
    </main>
  );
}
