import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../api/hr';
import { theme, chipStyle, SUCCESS, DANGER, WARNING } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { StatCard } from '../components/common/StatCard';
import { ProgressBar, Legend } from '../components/common/ProgressBar';
import { ClickableCard } from '../components/common/ClickableCard';
import { countdown, shiftLabel } from '../utils/format';
import { useLiveStatus } from '../context/LiveStatusContext';

function SectionHeading({ title }) {
  return <div style={theme.sectionHeader}>{title}</div>;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { setLastUpdated } = useLiveStatus();
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
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

  if (isLoading) return <CenteredSpinner label="Loading dashboard…" />;
  if (isError) return <EmptyState title="Could not load dashboard" message={error?.message} />;

  const { stats, byDepartment, livePolls } = data;

  return (
    <>
      <div style={theme.statGrid}>
        <StatCard label="Plants" value={stats.departments} />
        <StatCard label="Workers" value={stats.workers} />
        <StatCard label="Live polls" value={stats.livePolls} color={theme.accent} />
        <StatCard label="Coming" value={stats.coming} color={SUCCESS} />
        <StatCard label="Not coming" value={stats.notComing} color={DANGER} />
        <StatCard label="Pending" value={stats.pending} color={WARNING} />
      </div>

      <SectionHeading title="Live polls" />
      {livePolls.length === 0 ? (
        <EmptyState title="No open polls right now" message="Polls open automatically 30 minutes after a shift ends." />
      ) : (
        <div style={theme.pollStrip}>
          {livePolls.map((poll) => {
            const responded = poll.summary.coming + poll.summary.notComing;
            return (
              <div key={poll.id} style={theme.pollStripCard}>
                <div style={theme.pollStripHead}>
                  <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
                  <span style={theme.warnBadge}>closes in {countdown(poll.closesAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: theme.textSecondary, margin: '8px 0 10px' }}>
                  {shiftLabel(poll)} · {responded}/{poll.summary.totalWorkers} responded
                </div>
                <ProgressBar
                  coming={poll.summary.coming}
                  notComing={poll.summary.notComing}
                  pending={poll.summary.pending}
                  total={poll.summary.totalWorkers}
                />
                <Legend coming={poll.summary.coming} notComing={poll.summary.notComing} pending={poll.summary.pending} />
              </div>
            );
          })}
        </div>
      )}

      <SectionHeading title="Plants" />
      <div style={theme.plantGrid}>
        {byDepartment.map((dept) => (
          <ClickableCard key={dept.id} onClick={() => navigate(`/app/workforce?plant=${dept.id}`)}>
            <div style={theme.pollStripHead}>
              <span style={chipStyle(dept.code)}>{dept.code}</span>
              <span style={{ fontSize: 12, color: theme.mutedColor }}>{dept.incharges} incharges</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: theme.textPrimary, margin: '10px 0 2px' }}>{dept.name}</div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 10 }}>{dept.workers} workers today</div>
            <ProgressBar coming={dept.coming} notComing={dept.notComing} pending={dept.pending} total={dept.workers} />
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, marginTop: 10 }}>View workforce →</div>
          </ClickableCard>
        ))}
      </div>
    </>
  );
}
