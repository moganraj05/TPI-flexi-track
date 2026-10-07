import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../api/hr';
import { theme, chipStyle, SUCCESS, DANGER, WARNING, INFO } from '../theme';
import { spacing, radius, elevation } from '../tokens';
import { EmptyState } from '../components/common/EmptyState';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { ProgressBar, Legend } from '../components/common/ProgressBar';
import { SkeletonCard, SkeletonText } from '../components/common/Skeleton';
import { countdown, shiftLabel, formatDateTime } from '../utils/format';
import { useLiveStatus } from '../context/LiveStatusContext';

const page = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.xl },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.base },
  liveGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: spacing.base },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: spacing.base },
  listCard: { background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, overflow: 'hidden' },
};

export function Dashboard() {
  const navigate = useNavigate();
  const { setLastUpdated } = useLiveStatus();
  const { data, isPending: isLoading, isFetching, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['hr-dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
    // "Live overview" — always treated as stale so a fresh mount (or a
    // Socket.IO poll:update invalidation while mounted) refetches right
    // away, instead of the app-wide 30s staleTime holding it back.
    staleTime: 0,
  });

  useEffect(() => {
    if (dataUpdatedAt) setLastUpdated(dataUpdatedAt);
  }, [dataUpdatedAt, setLastUpdated]);

  // `isLoading` is only ever true once (no cached data at all) — it never
  // fires again on the 30s poll or a Socket.IO invalidation, since those
  // only flip `isFetching` while the previous data stays on screen. So this
  // skeleton can never flicker in on a live refresh; it's strictly a nicer
  // first paint than a bare spinner.
  if (isLoading) return <DashboardSkeleton />;
  if (isError && !data) {
    return <EmptyState title="Could not load dashboard" message={error?.message} icon="!" tone="danger" />;
  }

  const { stats, byDepartment, livePolls, recentClosed } = data;
  const trackedToday = stats.coming + stats.notComing + stats.pending;
  const notifiedPct = stats.workers ? Math.round((stats.notified / stats.workers) * 100) : 0;

  return (
    <div style={page.wrap}>
      <DashboardHeader stats={stats} isFetching={isFetching} onRefresh={refetch} />

      <section style={page.section}>
        <AttendanceKpis stats={stats} trackedToday={trackedToday} />
        <SupportingKpis stats={stats} notifiedPct={notifiedPct} />
      </section>

      <section style={page.section}>
        <SectionTitle
          eyebrow="Live operations"
          title="Active polls right now"
          hint={livePolls.length ? `${livePolls.length} in progress` : null}
        />
        {livePolls.length === 0 ? (
          <EmptyState
            title="No open polls right now"
            message="Polls open automatically 30 minutes after a shift ends."
            icon="✓"
          />
        ) : (
          <div style={page.liveGrid}>
            {livePolls.map((poll) => (
              <LiveOperationCard key={poll.id} poll={poll} onOpen={() => navigate(`/staff/app/attendance/${poll.id}`)} />
            ))}
          </div>
        )}
      </section>

      <section style={page.section}>
        <SectionTitle eyebrow="Plants" title="Department overview" />
        <div style={page.listCard}>
          {byDepartment.map((dept, i) => (
            <PlantRow
              key={dept.id}
              dept={dept}
              isLast={i === byDepartment.length - 1}
              onOpen={() => navigate(`/staff/app/workforce?plant=${dept.id}`)}
            />
          ))}
        </div>
      </section>

      {recentClosed.length > 0 && (
        <section style={page.section}>
          <SectionTitle eyebrow="History" title="Recently closed" />
          <div style={page.listCard}>
            {recentClosed.slice(0, 6).map((poll, i) => (
              <HistoryRow
                key={poll.id}
                poll={poll}
                isLast={i === Math.min(recentClosed.length, 6) - 1}
                onOpen={() => navigate(`/staff/app/attendance/${poll.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DashboardHeader({ stats, isFetching, onRefresh }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div className="ft-page-title" style={{ fontSize: 26, fontWeight: 800, color: theme.textPrimary, letterSpacing: '-0.01em' }}>Dashboard</div>
        <div style={{ fontSize: 13.5, color: theme.textSecondary, marginTop: 6, fontWeight: 500 }}>
          {stats.departments} plant{stats.departments === 1 ? '' : 's'} · {stats.workers} workers · {stats.incharges}{' '}
          incharges
          {stats.livePolls > 0 && (
            <>
              {' '}
              ·{' '}
              <span style={{ color: INFO, fontWeight: 700 }}>
                <span
                  className="ft-live-dot"
                  style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: INFO, marginRight: 6 }}
                />
                {stats.livePolls} poll{stats.livePolls === 1 ? '' : 's'} live now
              </span>
            </>
          )}
        </div>
      </div>
      <Button variant="secondary" onClick={() => onRefresh()} loading={isFetching} loadingLabel="Refreshing…">
        Refresh
      </Button>
    </div>
  );
}

function SectionTitle({ eyebrow, title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.accent }}>
          {eyebrow}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: theme.textPrimary, marginTop: 2 }}>{title}</div>
      </div>
      {hint && <div style={{ fontSize: 12, color: theme.mutedColor, fontWeight: 600 }}>{hint}</div>}
    </div>
  );
}

// The primary KPI tier — the three attendance-status counts that make up
// "who's actually coming," visually emphasized (large mono numbers, a
// colored top edge, elevation) above the quieter org-context row below.
function AttendanceKpis({ stats, trackedToday }) {
  const items = [
    { key: 'coming', label: 'Coming', value: stats.coming, tone: SUCCESS },
    { key: 'notComing', label: 'Not coming', value: stats.notComing, tone: DANGER },
    { key: 'pending', label: 'Pending', value: stats.pending, tone: WARNING },
  ];
  return (
    <div className="ft-kpi-grid" style={page.kpiGrid}>
      {items.map((item) => (
        <div
          key={item.key}
          className="ft-card-hover ft-kpi-card"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.borderColor}`,
            borderTop: `3px solid ${item.tone}`,
            borderRadius: radius.lg,
            padding: spacing.lg,
            boxShadow: elevation.card,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {item.label}
          </div>
          <div
            key={item.value}
            className="ft-fade-in ft-kpi-value"
            style={{ fontSize: 40, fontWeight: 800, fontFamily: theme.mono, color: item.tone, marginTop: 8, lineHeight: 1 }}
          >
            {item.value}
          </div>
          <div style={{ fontSize: 12, color: theme.mutedColor, marginTop: 8 }}>
            of {trackedToday}
            <span className="ft-hide-phone"> tracked today</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// The secondary/quiet tier — organizational context that doesn't need the
// same visual weight as live attendance counts. Rendered as a single soft
// strip rather than more bordered white cards, so it reads as "supporting
// information" at a glance instead of competing with the KPIs above it.
function SupportingKpis({ stats, notifiedPct }) {
  const items = [
    { label: 'Plants', value: stats.departments },
    { label: 'Workers', value: stats.workers },
    { label: 'Incharges', value: stats.incharges },
    { label: 'Live polls', value: stats.livePolls, tone: INFO },
    { label: 'Notified', value: `${notifiedPct}%` },
  ];
  return (
    <div className="ft-support-kpis" style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xl, padding: `${spacing.md}px ${spacing.base}px`, background: theme.bg, borderRadius: radius.md }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
          <span style={{ fontSize: 11, color: theme.mutedColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {item.label}
          </span>
          <span
            key={item.value}
            className="ft-fade-in"
            style={{ fontSize: 18, fontWeight: 800, fontFamily: theme.mono, color: item.tone || theme.textPrimary }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function LiveOperationCard({ poll, onOpen }) {
  const responded = poll.summary.coming + poll.summary.notComing;
  return (
    <button
      className="ft-card-hover"
      onClick={onOpen}
      style={{
        textAlign: 'left',
        background: theme.surface,
        border: `1px solid ${theme.borderColor}`,
        borderRadius: radius.lg,
        padding: spacing.lg,
        boxShadow: elevation.card,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ft-live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: SUCCESS, display: 'inline-block' }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: SUCCESS, textTransform: 'uppercase' }}>Live</span>
          <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
        </div>
        <Badge tone="warning">closes in {countdown(poll.closesAt)}</Badge>
      </div>
      <div style={{ fontWeight: 800, fontSize: 16, color: theme.textPrimary }}>{shiftLabel(poll)}</div>
      <div style={{ fontSize: 13, color: theme.textSecondary }}>
        {responded}/{poll.summary.totalWorkers} responded
      </div>
      <ProgressBar coming={poll.summary.coming} notComing={poll.summary.notComing} pending={poll.summary.pending} total={poll.summary.totalWorkers} />
      <Legend coming={poll.summary.coming} notComing={poll.summary.notComing} pending={poll.summary.pending} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: theme.accent, marginTop: 2 }}>View attendance →</span>
    </button>
  );
}

function PlantRow({ dept, isLast, onOpen }) {
  const hasLive = dept.livePolls > 0;
  return (
    <button
      className="ft-table-row ft-wrap-row"
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.base,
        width: '100%',
        textAlign: 'left',
        padding: `${spacing.md}px ${spacing.base}px`,
        border: 'none',
        borderBottom: isLast ? 'none' : `1px solid ${theme.borderColor}`,
        background: 'transparent',
      }}
    >
      <span style={chipStyle(dept.code)}>{dept.code}</span>
      <div style={{ minWidth: 0, flex: '1 1 150px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: theme.textPrimary }}>{dept.name}</div>
        <div style={{ fontSize: 12, color: theme.mutedColor }}>
          {dept.incharges} incharge{dept.incharges === 1 ? '' : 's'} · {dept.workers} workers
        </div>
      </div>
      {hasLive ? (
        <>
          <Badge tone="info">{dept.livePolls} live</Badge>
          <div className="ft-wrap-full" style={{ flex: 1, minWidth: 100 }}>
            <ProgressBar coming={dept.coming} notComing={dept.notComing} pending={dept.pending} total={dept.workers} />
          </div>
          <span style={{ fontSize: 12, color: theme.mutedColor, whiteSpace: 'nowrap' }}>
            {dept.coming} coming · {dept.pending} pending
          </span>
        </>
      ) : (
        <span style={{ flex: 1, fontSize: 12, color: theme.mutedColor }}>No live poll right now</span>
      )}
      <span className="ft-hide-phone" style={{ fontSize: 15, color: theme.mutedColor, flexShrink: 0 }}>→</span>
    </button>
  );
}

function HistoryRow({ poll, isLast, onOpen }) {
  const rate = poll.summary.attendanceRate;
  const rateTone = rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger';
  return (
    <button
      className="ft-table-row ft-wrap-row"
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.base,
        width: '100%',
        textAlign: 'left',
        padding: `${spacing.sm}px ${spacing.base}px`,
        border: 'none',
        borderBottom: isLast ? 'none' : `1px solid ${theme.borderColor}`,
        background: 'transparent',
      }}
    >
      <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
      <span style={{ fontSize: 13, color: theme.textPrimary, fontWeight: 600, minWidth: 110 }}>{shiftLabel(poll)}</span>
      <span className="ft-wrap-last" style={{ fontSize: 12, color: theme.mutedColor, flex: 1 }}>Closed {formatDateTime(poll.closesAt)}</span>
      <Badge tone={rateTone}>{rate}% attendance</Badge>
    </button>
  );
}

// Layout-shaped placeholder for the one-time initial load (no cached data
// yet) — mirrors the real composition instead of a single blank spinner.
// Never appears again after the first successful fetch: the 30s poll and
// Socket.IO invalidations only set `isFetching`, not `isLoading`.
function DashboardSkeleton() {
  return (
    <div style={page.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <SkeletonText width={140} height={26} />
          <div style={{ marginTop: 8 }}>
            <SkeletonText width={260} height={13} />
          </div>
        </div>
        <SkeletonText width={90} height={36} />
      </div>
      <div style={page.kpiGrid}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  );
}
