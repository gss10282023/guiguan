'use client';

import { useEffect, useState } from 'react';

import { useApi } from '../_lib/api';
import { useRequireAdmin } from '../_lib/auth';

type ChangeRequestItem = {
  id: string;
  sessionId: string;
  type: string;
  status: string;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  proposedTimeZone: string | null;
  createdAt: string;
  session: {
    startAtUtc: string;
    endAtUtc: string;
    classTimeZone: string;
    studentName: string | null;
    teacherName: string | null;
  };
};

export default function ChangeRequestsPage() {
  const { hydrated, accessToken } = useRequireAdmin();
  const { apiFetchJson } = useApi();

  const [items, setItems] = useState<ChangeRequestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    const data = await apiFetchJson<ChangeRequestItem[]>('/admin/change-requests?status=PENDING');
    setItems(data);
  };

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void refresh().catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, hydrated]);

  return (
    <main className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>审批</h1>
        <button className="btnSecondary" type="button" onClick={() => void refresh()} disabled={items === null}>
          刷新
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {items === null ? (
        <div className="card muted">加载中…</div>
      ) : items.length === 0 ? (
        <div className="card muted">暂无待审批申请</div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <div key={item.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  {item.type} / {item.status}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {item.createdAt.slice(0, 19).replace('T', ' ')}
                </span>
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                Session: {item.sessionId}
              </div>

              <div style={{ fontSize: 13 }}>
                老师：{item.session.teacherName ?? '—'}；学生：{item.session.studentName ?? '—'}
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                原课程：{item.session.startAtUtc} → {item.session.endAtUtc}（{item.session.classTimeZone}）
              </div>

              {item.type === 'RESCHEDULE' ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  申请改为：{item.proposedStartAtUtc} → {item.proposedEndAtUtc}（{item.proposedTimeZone}）
                </div>
              ) : null}

              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  type="button"
                  disabled={busyId === item.id}
                  onClick={async () => {
                    setError(null);
                    setBusyId(item.id);
                    try {
                      await apiFetchJson(`/admin/change-requests/${item.id}/approve`, { method: 'POST' });
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '审批失败');
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  通过
                </button>

                <button
                  className="btnDanger"
                  type="button"
                  disabled={busyId === item.id}
                  onClick={async () => {
                    setError(null);
                    setBusyId(item.id);
                    try {
                      await apiFetchJson(`/admin/change-requests/${item.id}/reject`, { method: 'POST' });
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '驳回失败');
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  驳回
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

