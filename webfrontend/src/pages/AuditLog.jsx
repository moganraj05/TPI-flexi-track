import { Fragment, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { theme, chipStyle } from '../theme';
import { downloadAuditLogCsv, getAuditLogs, getAuditMeta } from '../api/hr';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { PlantSelect } from '../components/common/PlantSelect';
import { CenteredSpinner } from '../components/common/Spinner';
import { isAdminRole, roleTag } from '../utils/roles';

const PAGE_SIZE = 50;

// Plain-language names for the technical keys stored in an entry's details.
const DETAIL_LABELS = {
  reason: 'Reason',
  role: 'Role',
  via: 'Done from',
  target: 'Sent to',
  title: 'Title',
  message: 'Message',
  workers: 'Workers targeted',
  reachable: 'With notifications on',
  devicesSent: 'Devices reached',
  devicesFailed: 'Devices failed',
  invitationEmailed: 'Invitation emailed',
  replacedTemporary: 'Replaced a temporary password',
  expiresAt: 'Temporary password valid until',
  scope: 'Applied to',
  count: 'Accounts',
  bulk: 'Part of a multi-select action',
  report: 'Report',
  format: 'Format',
  fileName: 'File',
  rows: 'Rows',
  status: 'Poll status',
  fromDate: 'From',
  toDate: 'To',
  date: 'Date',
  plant: 'Plant',
  created: 'Created',
  skipped: 'Skipped',
  workerEmployeeId: 'Worker',
  scheduledClosesAt: 'Was due to close',
  createdEmployeeIds: 'Employee IDs created',
  level: 'Sent to',
  from: 'Moved from',
  to: 'Moved to',
};
const LEVEL_LABELS = { incharge: 'Their incharge', supervisor: "The plant's supervisors", staff: 'HR / admin' };
const REASON_LABELS = {
  unknown_email: 'No account with this email',
  wrong_password: 'Wrong password',
  not_a_staff_account: 'Not an HR/admin account',
  awaiting_approval: 'Account waiting for approval',
  account_deactivated: 'Account deactivated',
  invite_not_accepted: 'Invitation not accepted yet (no password set)',
};
// Internal IDs and bulky lists that don't help a reader of the log.
const HIDDEN_DETAILS = new Set(['workerId', 'filters', 'skippedRows', 'requestId']);

const formatTime = (iso) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
  };
};

// "Chrome on Android" from a user-agent string — enough to recognise a
// device without showing the whole string.
function describeDevice(ua) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|axios|node/i.test(ua) ? 'Script' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}

function detailValue(key, value) {
  if (key === 'reason') return REASON_LABELS[value] || value;
  if (key === 'role') return roleTag(value);
  if (key === 'via') return value === 'incharge_app' ? 'Incharge app' : value === 'staff_console' ? 'Staff console' : value;
  if (key === 'level' || key === 'from' || key === 'to') return LEVEL_LABELS[value] || value;
  if (key === 'scheduledClosesAt' || key === 'expiresAt') return new Date(value).toLocaleString('en-IN');
  if (key === 'scope') return value === 'all' ? 'Everyone' : value === 'plant' ? 'One plant' : value;
  if (Array.isArray(value)) return value.length > 20 ? `${value.slice(0, 20).join(', ')} … (+${value.length - 20} more)` : value.join(', ');
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

// Admin-only record of every change and download in FlexiTrack: who did
// what, to which record, before -> after, when, and from where. Entries are
// written by the backend and can't be edited or deleted.
export function AuditLog() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = isAdminRole(user?.role);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const filters = {
    q: debouncedSearch || undefined,
    category: category || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const rangeInvalid = !!(from && to && from > to);

  const metaQuery = useQuery({ queryKey: ['hr-audit-meta'], queryFn: getAuditMeta, staleTime: Infinity, enabled: isAdmin });
  const logsQuery = useQuery({
    queryKey: ['hr-audit-logs', filters, page],
    queryFn: () => getAuditLogs({ ...filters, page, limit: PAGE_SIZE }),
    enabled: isAdmin && !rangeInvalid,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admins only"
        message="The audit log is visible to admin and super admin logins. Ask an admin if you need to check a change."
      />
    );
  }

  const categoryOptions = [
    { value: '', label: 'All activity' },
    ...(metaQuery.data?.categories || []).map((c) => ({ value: c.value, label: c.label })),
  ];
  const entries = logsQuery.data?.items || [];
  const meta = logsQuery.data?.meta;
  const filtersActive = !!(debouncedSearch || category || from || to);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAuditLogCsv(filters);
      toast('Audit log downloaded', 'success');
    } catch (err) {
      toast(err.message || 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setCategory('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="ft-page-title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: theme.textPrimary }}>Audit log</h1>
          <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>
            Every change and download in FlexiTrack — who did it, what changed, when, and from where. Entries are permanent: they can&apos;t be edited or deleted.
          </div>
        </div>
        <Button variant="secondary" onClick={handleDownload} loading={downloading} loadingLabel="Preparing…" disabled={rangeInvalid}>
          Download CSV
        </Button>
      </div>

      <div style={{ ...theme.filterRow, gap: 10 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, employee ID, email, IP…"
          aria-label="Search the audit log"
          style={{ ...theme.input, background: theme.surface, width: 300, maxWidth: '100%', padding: '8px 12px', borderRadius: 20 }}
        />
        <PlantSelect options={categoryOptions} value={category} onChange={(v) => { setCategory(v); setPage(1); }} />
        <label style={{ fontSize: 12.5, fontWeight: 700, color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
          From
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ ...theme.input, background: theme.surface, width: 'auto', padding: '6px 10px' }} />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
          To
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ ...theme.input, background: theme.surface, width: 'auto', padding: '6px 10px' }} />
        </label>
        {filtersActive && (
          <button type="button" onClick={resetFilters} style={theme.ghostBtn}>
            Clear filters
          </button>
        )}
        {meta && (
          <span style={{ fontSize: 12.5, color: theme.textSecondary, fontWeight: 600, marginLeft: 'auto' }}>
            {meta.total} {meta.total === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>
      {rangeInvalid && <div style={theme.errorText}>“From” must be on or before “To”.</div>}

      {logsQuery.isPending && !rangeInvalid ? (
        <CenteredSpinner label="Loading the audit log…" />
      ) : logsQuery.isError && !logsQuery.data ? (
        <EmptyState title="Couldn't load the audit log" message={logsQuery.error.message} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={filtersActive ? 'No matching entries' : 'Nothing recorded yet'}
          message={filtersActive ? 'Try a different search, category or date range.' : 'Changes and downloads will appear here as people use FlexiTrack.'}
        />
      ) : (
        <section style={{ ...theme.card, padding: 0, overflowX: 'auto' }}>
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={{ ...theme.th, width: 130 }}>When</th>
                <th style={{ ...theme.th, width: 190 }}>Done by</th>
                <th style={{ ...theme.th, width: 210 }}>Action</th>
                <th style={theme.th}>What happened</th>
                <th style={{ ...theme.th, width: 40 }} aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const open = expanded === entry.id;
                const t = formatTime(entry.createdAt);
                return (
                  <Fragment key={entry.id}>
                    <tr
                      className="ft-table-row"
                      style={{ ...theme.tr, cursor: 'pointer', borderBottom: open ? 'none' : theme.tr.borderBottom }}
                      onClick={() => setExpanded(open ? null : entry.id)}
                    >
                      <td style={{ ...theme.td, verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700 }}>{t.date}</div>
                        <div style={{ fontSize: 12, color: theme.textSecondary, fontFamily: theme.mono }}>{t.time}</div>
                      </td>
                      <td style={{ ...theme.td, verticalAlign: 'top' }}>
                        {entry.actor ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{entry.actor.name || entry.actor.identifier}</div>
                            <div style={{ fontSize: 12, color: theme.textSecondary }}>
                              {[entry.actor.role ? roleTag(entry.actor.role) : null, entry.actor.name ? entry.actor.identifier : null].filter(Boolean).join(' · ')}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: theme.textSecondary }}>System</span>
                        )}
                      </td>
                      <td style={{ ...theme.td, verticalAlign: 'top' }}>
                        <span style={chipStyle(entry.category)}>{entry.categoryLabel}</span>
                        <div style={{ fontSize: 12.5, marginTop: 6, color: entry.action === 'auth.staff_sign_in_failed' ? theme.textPrimary : theme.textSecondary, fontWeight: entry.action === 'auth.staff_sign_in_failed' ? 700 : 500 }}>
                          {entry.actionLabel}
                        </div>
                      </td>
                      <td style={{ ...theme.td, verticalAlign: 'top', lineHeight: 1.45 }}>
                        {entry.summary}
                        {entry.changes.length > 0 && !open && (
                          <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                            {entry.changes.length} field{entry.changes.length === 1 ? '' : 's'} changed
                          </div>
                        )}
                      </td>
                      <td style={{ ...theme.td, verticalAlign: 'top', color: theme.textSecondary }}>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={open ? 'Hide details' : 'Show details'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(open ? null : entry.id);
                          }}
                          style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 14, padding: 4 }}
                        >
                          {open ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr style={theme.tr}>
                        <td colSpan={5} style={{ ...theme.td, background: theme.bg, padding: '14px 18px 18px' }}>
                          <EntryDetails entry={entry} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {meta && <Pagination page={page} pageCount={meta.pageCount} onChange={setPage} disabled={logsQuery.isFetching} />}
    </>
  );
}

function EntryDetails({ entry }) {
  const details = Object.entries(entry.metadata).filter(([key, value]) => !HIDDEN_DETAILS.has(key) && value !== null && value !== undefined);
  const facts = [
    ['Record', entry.entity.label],
    ['Record type', entry.entity.type],
    ['IP address', entry.ipAddress],
    ['Device', describeDevice(entry.userAgent)],
    ['Request ID', entry.requestId],
    ['Exact time', new Date(entry.createdAt).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' })],
  ].filter(([, value]) => value);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 18 }}>
      {entry.changes.length > 0 && (
        <div>
          <DetailHeading>Changes</DetailHeading>
          <table style={{ ...theme.table, background: theme.surface, borderRadius: 8, overflow: 'hidden' }}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={{ ...theme.th, padding: '8px 12px' }}>Field</th>
                <th style={{ ...theme.th, padding: '8px 12px' }}>Before</th>
                <th style={{ ...theme.th, padding: '8px 12px' }}>After</th>
              </tr>
            </thead>
            <tbody>
              {entry.changes.map((c) => (
                <tr key={c.field} style={theme.tr}>
                  <td style={{ ...theme.td, padding: '8px 12px', fontWeight: 700 }}>{c.label}</td>
                  {c.note === 'changed' ? (
                    <td colSpan={2} style={{ ...theme.td, padding: '8px 12px', color: theme.textSecondary }}>
                      Changed (passwords are never stored in the log)
                    </td>
                  ) : (
                    <>
                      <td style={{ ...theme.td, padding: '8px 12px', color: theme.textSecondary, textDecoration: c.from ? 'line-through' : 'none' }}>{c.from ?? '—'}</td>
                      <td style={{ ...theme.td, padding: '8px 12px', fontWeight: 600 }}>{c.to ?? '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {details.length > 0 && (
        <div>
          <DetailHeading>Details</DetailHeading>
          <FactList rows={details.map(([key, value]) => [DETAIL_LABELS[key] || key, detailValue(key, value)])} />
        </div>
      )}

      <div>
        <DetailHeading>Where &amp; when</DetailHeading>
        <FactList rows={facts} mono={['IP address', 'Request ID']} />
      </div>
    </div>
  );
}

function DetailHeading({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function FactList({ rows, mono = [] }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 14px', fontSize: 13 }}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt style={{ color: theme.textSecondary, fontWeight: 600 }}>{label}</dt>
          <dd style={{ margin: 0, color: theme.textPrimary, wordBreak: 'break-word', fontFamily: mono.includes(label) ? theme.mono : undefined, fontSize: mono.includes(label) ? 12 : 13 }}>
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
