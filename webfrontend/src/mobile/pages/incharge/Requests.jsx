import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '../../components/BottomSheet';
import { Icon } from '../../components/Icon';
import { Avatar, Button, ErrorState, FilterChips, Loading, ScreenHeader, StatusPill } from '../../components/ui';
import { useMobileToast } from '../../context/ToastContext';
import { useResetRequests } from '../../hooks';
import { api } from '../../api';
import { TempPasswordSheet } from './TempPasswordSheet';

const VIEWS = [
  { value: 'pending', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

const REJECT_REASONS = ['Not requested by them', "Couldn't reach them", 'Wrong person'];

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};
const until = (iso) => {
  const hours = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));
  return hours < 1 ? 'expires within the hour' : `expires in ${hours} h`;
};
const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

// Incharge "Requests" tab: people who forgot their password and asked for
// help from the sign-in page. Call them to confirm it's really them, then
// reset (temporary password, shown once) or reject.
export function InchargeRequests() {
  const [view, setView] = useState('pending');
  const [openId, setOpenId] = useState(null);
  const [issued, setIssued] = useState(null);
  const query = useResetRequests(view);
  const items = query.data?.data ?? [];
  const pendingCount = query.data?.meta?.pendingCount ?? 0;
  const open = items.find((r) => r.id === openId) || null;

  // The open request was handled elsewhere (another supervisor, or the person
  // signed in) — close its sheet.
  useEffect(() => {
    if (openId && view === 'pending' && query.data && !open) setOpenId(null);
  }, [openId, view, query.data, open]);

  return (
    <div className="m-screen">
      <ScreenHeader kicker="Password help" title="Requests" />

      <div className="m-body">
        <FilterChips label="Show" value={view} onChange={setView} options={VIEWS.map((v) => (v.value === 'pending' && pendingCount ? { ...v, label: `Waiting · ${pendingCount}` } : v))} />

        {query.isPending ? (
          <Loading />
        ) : query.isError && !query.data ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <div className="m-card m-empty">
            <Icon name="key" size={30} className="m-text-muted" />
            <div className="m-empty-title">{view === 'pending' ? 'No requests waiting' : 'Nothing here yet'}</div>
            <p className="m-empty-text">
              {view === 'pending'
                ? 'When someone on your team taps “Forgot password?”, their request appears here and you get a notification.'
                : 'Requests you have handled appear here.'}
            </p>
          </div>
        ) : (
          <ul className="m-worker-list">
            {items.map((r) => (
              <RequestCard key={r.id} request={r} onOpen={() => setOpenId(r.id)} />
            ))}
          </ul>
        )}
      </div>

      <RequestSheet
        request={view === 'pending' ? open : null}
        onClose={() => setOpenId(null)}
        onIssued={(login) => {
          setOpenId(null);
          setIssued(login);
        }}
      />
      <TempPasswordSheet
        login={issued}
        title={issued ? `New password for ${issued.name.split(' ')[0]}` : ''}
        onClose={() => setIssued(null)}
      />
    </div>
  );
}

function statusOf(r) {
  if (r.status === 'pending') return { label: 'Waiting', tone: 'wait' };
  if (r.status === 'approved') return r.completed ? { label: 'Completed', tone: 'go' } : { label: 'Waiting for them to sign in', tone: 'brand' };
  if (r.status === 'rejected') return { label: 'Rejected', tone: 'stop' };
  if (r.status === 'cancelled') return { label: 'They signed in', tone: 'muted' };
  return { label: 'Expired', tone: 'muted' };
}

function RequestCard({ request: r, onOpen }) {
  const p = r.person;
  const status = statusOf(r);
  const pending = r.status === 'pending';
  const Tag = pending ? 'button' : 'div';
  return (
    <li className="m-card m-worker-card">
      <Tag type={pending ? 'button' : undefined} className={pending ? 'm-request-open' : 'm-request-static'} onClick={pending ? onOpen : undefined}>
        <span className="m-worker-top">
          <Avatar name={p?.name} employeeId={p?.employeeId} size={46} />
          <span className="m-row-main">
            <span className="m-worker-name">{p?.name || 'Unknown'}</span>
            <span className="m-worker-meta">
              <span className="m-mono">{p?.employeeId}</span>
              <span>· {p?.roleLabel}</span>
            </span>
          </span>
          {pending ? <Icon name="chevron-right" size={18} className="m-text-muted" /> : null}
        </span>
        <span className="m-tag-row">
          <StatusPill label={status.label} tone={status.tone} small />
          <span className="m-tag">{pending ? `Asked ${ago(r.lastRequestedAt)}` : `${when(r.handledAt || r.lastRequestedAt)}`}</span>
          {pending ? <span className="m-tag">{until(r.expiresAt)}</span> : null}
          {pending && r.requestCount > 1 ? <span className="m-tag m-tag-wait">Asked {r.requestCount}×</span> : null}
          {pending && r.escalatedAt ? (
            <span className="m-tag m-tag-stop">{r.level === 'staff' ? 'Overdue · also with HR' : 'Overdue · sent to supervisors'}</span>
          ) : null}
          {pending && r.recentRequests >= 3 ? <span className="m-tag m-tag-stop">{r.recentRequests} requests in 30 days</span> : null}
        </span>
        {!pending && (r.handledByName || r.rejectReason) ? (
          <span className="m-request-note">
            {r.status === 'rejected' ? `Rejected by ${r.handledByName}: ${r.rejectReason}` : null}
            {r.status === 'approved' ? `Temporary password issued by ${r.handledByName}` : null}
            {r.status === 'cancelled' ? 'They remembered their password and signed in.' : null}
          </span>
        ) : null}
      </Tag>
    </li>
  );
}

function RequestSheet({ request, onClose, onIssued }) {
  const queryClient = useQueryClient();
  const toast = useMobileToast();
  const [confirmed, setConfirmed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = request?.id;

  useEffect(() => {
    setConfirmed(false);
    setRejecting(false);
    setReason('');
    setError('');
  }, [requestId]);

  if (!request) return null;
  const p = request.person;
  const first = p.name.split(' ')[0];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['m', 'reset-requests'] });

  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.approveResetRequest(request.id);
      refresh();
      onIssued(result.data);
    } catch (err) {
      setError(err.message || 'Could not reset the password');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) return setError('Choose or type a reason.');
    setBusy(true);
    setError('');
    try {
      await api.rejectResetRequest(request.id, reason.trim());
      refresh();
      toast('Request rejected', `${p.name} was not given a new password`);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not reject the request');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={!!request} onClose={() => !busy && onClose()} labelledBy="request-title">
      <div className="m-worker-top" style={{ marginBottom: 14 }}>
        <Avatar name={p.name} employeeId={p.employeeId} size={52} />
        <div className="m-row-main">
          <h2 id="request-title" className="m-sheet-title" style={{ margin: 0 }}>
            {p.name}
          </h2>
          <div className="m-worker-meta">
            <span className="m-mono">{p.employeeId}</span>
            <span>· {p.roleLabel}</span>
          </div>
        </div>
      </div>

      <section className="m-card m-details" style={{ background: 'var(--field)', marginBottom: 14 }}>
        <div className="m-detail-row">
          <span className="m-detail-label">Phone</span>
          <span className="m-detail-value">{p.phone ? <a className="m-link" href={`tel:${p.phone}`}>{p.phone}</a> : 'Not on file'}</span>
        </div>
        {p.shiftLabel ? (
          <div className="m-detail-row">
            <span className="m-detail-label">Shift</span>
            <span className="m-detail-value">{p.shiftLabel}</span>
          </div>
        ) : null}
        <div className="m-detail-row">
          <span className="m-detail-label">Asked</span>
          <span className="m-detail-value">
            {ago(request.lastRequestedAt)}
            {request.requestCount > 1 ? ` (${request.requestCount} times)` : ''}
          </span>
        </div>
        <div className="m-detail-row">
          <span className="m-detail-label">Last signed in</span>
          <span className="m-detail-value">{p.lastLoginAt ? when(p.lastLoginAt) : 'Never / not recorded'}</span>
        </div>
      </section>

      {request.recentRequests >= 3 ? (
        <p className="m-temp-note" style={{ marginBottom: 14 }}>
          <b>{request.recentRequests} reset requests in the last 30 days.</b> Make sure it's really {first} before resetting.
        </p>
      ) : null}

      {rejecting ? (
        <div className="m-form-stack">
          <div className="m-field-label">Why reject it?</div>
          <FilterChips label="Reason" value={reason} onChange={setReason} options={REJECT_REASONS.map((r) => ({ value: r, label: r }))} />
          <input
            className="m-input"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 200))}
            placeholder="Or type a reason"
            aria-label="Reason"
          />
          {error ? <p className="m-form-error" role="alert">{error}</p> : null}
          <div className="m-sheet-actions">
            <Button variant="field" onClick={() => setRejecting(false)} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" onClick={reject} loading={busy}>
              Reject request
            </Button>
          </div>
        </div>
      ) : (
        <div className="m-form-stack">
          <ol className="m-steps m-steps-lg">
            <li>
              {p.phone ? (
                <>
                  <a className="m-link" href={`tel:${p.phone}`}>
                    Call {first}
                  </a>{' '}
                  to check they really asked.
                </>
              ) : (
                <>Speak to {first} in person to check they really asked.</>
              )}
            </li>
            <li>Reset — you get a temporary password to tell them (works 24 hours).</li>
            <li>They sign in with it and choose their own password.</li>
          </ol>
          <label className="m-confirm-check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I spoke to {first} and confirmed it's really them.</span>
          </label>
          {error ? <p className="m-form-error" role="alert">{error}</p> : null}
          <div className="m-sheet-actions">
            <Button variant="dangerSoft" onClick={() => setRejecting(true)} disabled={busy}>
              Reject
            </Button>
            <Button variant="brand" onClick={approve} loading={busy} disabled={!confirmed}>
              Reset password
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
