import { Fragment, useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveResetRequest, getDepartments, getResetRequests, rejectResetRequest } from '../api/hr';
import { theme, chipStyle, WARNING, WARNING_SOFT } from '../theme';
import { useToast } from '../context/ToastContext';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Dialog } from '../components/common/Dialog';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { Pagination } from '../components/common/Pagination';
import { PlantSelect } from '../components/common/PlantSelect';
import { CenteredSpinner } from '../components/common/Spinner';
import { TempPasswordNotice } from '../components/common/TempPasswordNotice';

const PAGE_SIZE = 25;
const REJECT_REASONS = ['Not requested by them', "Couldn't reach them", 'Wrong person'];

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};
const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

const LEVEL_TEXT = { incharge: 'Incharge', supervisor: 'Plant supervisors', staff: 'HR / admin' };

function doneStatus(r) {
  if (r.status === 'approved') return r.completed ? ['success', 'Completed'] : ['info', 'Temporary password issued'];
  if (r.status === 'rejected') return ['danger', 'Rejected'];
  if (r.status === 'cancelled') return ['neutral', 'They signed in'];
  return ['neutral', 'Expired'];
}

// Worker-app "Forgot password?" requests from every plant. They go to the
// person's incharge first and move up (supervisors, then HR) when nobody acts
// within 12 hours; Staff and Admins can handle any of them from here.
export function PasswordRequests() {
  const [view, setView] = useState('hr');
  const [plant, setPlant] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments, staleTime: 5 * 60 * 1000 });
  const query = useQuery({
    queryKey: ['hr-reset-requests', view, plant, debouncedSearch, page],
    queryFn: () => getResetRequests({ view, department: plant, q: debouncedSearch || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchInterval: 60 * 1000,
  });
  const items = query.data?.items || [];
  const meta = query.data?.meta;
  const counts = meta?.counts || { open: 0, hr: 0 };
  const open = items.find((r) => r.id === openId) || null;
  const isOpenView = view !== 'done';

  const changeView = (v) => {
    setView(v);
    setPage(1);
  };

  return (
    <>
      <div>
        <h1 className="ft-page-title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: theme.textPrimary }}>Password requests</h1>
        <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, maxWidth: 680, lineHeight: 1.5 }}>
          Workers and incharges who tapped “Forgot password?”. Each request goes to their incharge first; if nobody acts within
          12 hours it moves to the plant&apos;s supervisors, then to HR. You can handle any request: call the person, then issue a
          temporary password or reject it.
        </div>
      </div>

      <FilterChips
        value={view}
        onChange={changeView}
        options={[
          { value: 'hr', label: `Waiting for HR · ${counts.hr}` },
          { value: 'open', label: `All open · ${counts.open}` },
          { value: 'done', label: 'Done' },
        ]}
      />

      <div style={{ ...theme.filterRow, gap: 10 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or employee ID…"
          aria-label="Search requests"
          style={{ ...theme.input, background: theme.surface, width: 260, maxWidth: '100%', padding: '8px 12px', borderRadius: 20 }}
        />
        <PlantSelect options={plantFilterOptions(departments)} value={plant} onChange={(v) => { setPlant(v); setPage(1); }} />
        {meta && (
          <span style={{ fontSize: 12.5, color: theme.textSecondary, fontWeight: 600, marginLeft: 'auto' }}>
            {meta.total} {meta.total === 1 ? 'request' : 'requests'}
          </span>
        )}
      </div>

      {query.isPending ? (
        <CenteredSpinner label="Loading requests…" />
      ) : query.isError && !query.data ? (
        <EmptyState title="Couldn't load password requests" message={query.error.message} />
      ) : items.length === 0 ? (
        <EmptyState
          title={view === 'hr' ? 'Nothing waiting for HR' : view === 'open' ? 'No open requests' : 'No handled requests yet'}
          message={
            view === 'hr'
              ? 'Requests land here when an incharge or supervisor hasn’t acted within 12 hours, or when a supervisor asks.'
              : 'When someone taps “Forgot password?” in the worker app, their request appears here.'
          }
        />
      ) : (
        <section style={{ ...theme.card, padding: 0, overflowX: 'auto' }}>
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={theme.th}>Person</th>
                <th style={theme.th}>Phone</th>
                <th style={theme.th}>Asked</th>
                <th style={theme.th}>{isOpenView ? 'With' : 'Outcome'}</th>
                <th style={{ ...theme.th, width: 110 }} aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <RequestRow key={r.id} request={r} isOpenView={isOpenView} onHandle={() => setOpenId(r.id)} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {meta && <Pagination page={page} pageCount={meta.pageCount} onChange={setPage} disabled={query.isFetching} />}

      {openId && <HandleDialog key={openId} request={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function RequestRow({ request: r, isOpenView, onHandle }) {
  const p = r.person || {};
  const [tone, label] = doneStatus(r);
  return (
    <tr className="ft-table-row" style={theme.tr}>
      <td style={theme.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={p.name} size={34} />
          <div>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: theme.textSecondary, display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <span style={{ fontFamily: theme.mono }}>{p.employeeId}</span>
              <span>· {p.roleLabel}</span>
              {p.department?.code && <span style={chipStyle(p.department.code)}>{p.department.code}</span>}
            </div>
          </div>
        </div>
      </td>
      <td style={{ ...theme.td, fontFamily: theme.mono, fontSize: 13 }}>{p.phone || '—'}</td>
      <td style={theme.td}>
        <div>{ago(r.createdAt)}</div>
        <div style={{ fontSize: 12, color: theme.textSecondary }}>
          {r.requestCount > 1 ? `Asked ${r.requestCount}× · ` : ''}
          {r.recentRequests >= 3 ? <b style={{ color: WARNING }}>{r.recentRequests} in 30 days</b> : when(r.lastRequestedAt)}
        </div>
      </td>
      <td style={theme.td}>
        {isOpenView ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 600 }}>
              {LEVEL_TEXT[r.level]}
              {r.level === 'incharge' && r.routedToName ? ` · ${r.routedToName}` : ''}
            </span>
            {r.escalatedAt && <Badge tone="warning">Overdue · moved up {ago(r.escalatedAt)}</Badge>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <Badge tone={tone}>{label}</Badge>
            <span style={{ fontSize: 12, color: theme.textSecondary }}>
              {r.status === 'rejected' && `${r.handledByName}: ${r.rejectReason}`}
              {r.status === 'approved' && `By ${r.handledByName} · ${when(r.handledAt)}`}
              {(r.status === 'expired' || r.status === 'cancelled') && when(r.handledAt || r.expiresAt)}
            </span>
          </div>
        )}
      </td>
      <td style={{ ...theme.td, textAlign: 'right' }}>
        {isOpenView && (
          <Button size="sm" variant={r.level === 'staff' ? 'primary' : 'secondary'} onClick={onHandle}>
            Handle
          </Button>
        )}
      </td>
    </tr>
  );
}

function HandleDialog({ request, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hr-reset-requests'] });
    queryClient.invalidateQueries({ queryKey: ['hr-reset-summary'] });
  };

  // Shown once after approving — stays even though the request left the list.
  if (issued) {
    return (
      <Dialog disableOverlayClose>
        <TempPasswordNotice
          title="Temporary password issued"
          name={issued.name}
          employeeId={issued.employeeId}
          password={issued.temporaryPassword}
          expiresAt={issued.temporaryPasswordExpiresAt}
          onDone={onClose}
        />
      </Dialog>
    );
  }

  // Handled elsewhere (incharge app, another HR login, or they signed in).
  if (!request) {
    return (
      <Dialog onClose={onClose}>
        <div style={{ fontWeight: 800, fontSize: 17, color: theme.textPrimary }}>Request no longer open</div>
        <div style={{ fontSize: 14, color: theme.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
          Someone else handled it, or the person signed in with their password. Check the Done tab.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      </Dialog>
    );
  }

  const p = request.person;
  const first = p.name.split(' ')[0];

  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      setIssued(await approveResetRequest(request.id));
      refresh();
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
      await rejectResetRequest(request.id, reason.trim());
      refresh();
      toast(`Request rejected — ${p.name} was not given a new password`, 'success');
      onClose();
    } catch (err) {
      setError(err.message || 'Could not reject the request');
      refresh();
      setBusy(false);
    }
  };

  const facts = [
    ['Employee ID', <span key="id" style={{ fontFamily: theme.mono }}>{p.employeeId}</span>],
    ['Role · plant', `${p.roleLabel}${p.department?.code ? ` · ${p.department.code}` : ''}`],
    ['Phone', p.phone ? <a key="tel" href={`tel:${p.phone}`} style={{ color: theme.accent, fontWeight: 700 }}>{p.phone}</a> : 'Not on file'],
    ['Shift', p.shiftLabel || '—'],
    ['Asked', `${when(request.createdAt)}${request.requestCount > 1 ? ` (${request.requestCount} times)` : ''}`],
    ['Currently with', `${LEVEL_TEXT[request.level]}${request.routedToName && request.level === 'incharge' ? ` · ${request.routedToName}` : ''}`],
    ['Last signed in', p.lastLoginAt ? when(p.lastLoginAt) : 'Never / not recorded'],
  ];

  return (
    <Dialog onClose={busy ? undefined : onClose} disableOverlayClose={busy}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Avatar name={p.name} size={44} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: theme.textPrimary }}>{p.name}</div>
          <div style={{ fontSize: 12.5, color: theme.textSecondary }}>Password reset request</div>
        </div>
      </div>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', fontSize: 13 }}>
        {facts.map(([label, value]) => (
          <Fragment key={label}>
            <dt style={{ color: theme.textSecondary, fontWeight: 600 }}>{label}</dt>
            <dd style={{ margin: 0, color: theme.textPrimary }}>{value}</dd>
          </Fragment>
        ))}
      </dl>

      {request.recentRequests >= 3 && (
        <div style={{ background: WARNING_SOFT, color: WARNING, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, marginTop: 14 }}>
          <b>{request.recentRequests} reset requests in the last 30 days.</b> Make sure it&apos;s really {first} before resetting.
        </div>
      )}

      {rejecting ? (
        <>
          <label style={theme.label}>Why reject it?</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} style={{ ...theme.ghostBtn, ...(reason === r ? { background: theme.textPrimary, color: theme.surface, borderColor: theme.textPrimary } : null) }}>
                {r}
              </button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Or type a reason" aria-label="Reason" style={theme.input} />
          {error && <div style={theme.errorText}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => { setRejecting(false); setError(''); }} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" onClick={reject} loading={busy}>
              Reject request
            </Button>
          </div>
        </>
      ) : (
        <>
          <ol style={{ margin: '16px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: theme.textSecondary }}>
            <li>Call {first} to check they really asked.</li>
            <li>Reset — you get a temporary password to tell them (works 24 hours).</li>
            <li>They sign in with it and choose their own password.</li>
          </ol>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '10px 12px', borderRadius: 8, background: theme.bg, fontSize: 13.5, fontWeight: 600, color: theme.textPrimary, cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 17, height: 17, margin: '1px 0 0', accentColor: theme.accent }} />
            I spoke to {first} and confirmed it&apos;s really them.
          </label>
          {error && <div style={theme.errorText}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => { setRejecting(true); setError(''); }} disabled={busy}>
              Reject
            </Button>
            <Button onClick={approve} loading={busy} disabled={!confirmed}>
              Reset password
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
