import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../api/hr';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { StatChip } from '../components/dashboard/StatChip';
import { DepartmentCard } from '../components/dashboard/DepartmentCard';
import { LivePollCard } from '../components/dashboard/LivePollCard';
import { formatDate } from '../utils/format';

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, isRefetching } = useQuery({
    queryKey: ['hr-dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  });

  if (isLoading) return <CenteredSpinner label="Loading dashboard…" />;

  if (isError) {
    return (
      <EmptyState
        title="Could not load dashboard"
        message={error?.message}
      />
    );
  }

  const { stats, byDepartment, livePolls } = data;

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink-soft)' }}>
        {formatDate(new Date())} {isRefetching && '· refreshing…'}
      </p>

      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}>
        <StatChip label="Departments" value={stats.departments} />
        <StatChip label="Workers" value={stats.workers} />
        <StatChip label="Live polls" value={stats.livePolls} tone="blue" />
        <StatChip label="Coming" value={stats.coming} tone="green" />
        <StatChip label="Not coming" value={stats.notComing} tone="red" />
        <StatChip label="Pending" value={stats.pending} tone="amber" />
      </div>

      <SectionHeading title="Live polls" />
      {livePolls.length === 0 ? (
        <EmptyState
          title="No open polls right now"
          message="Polls open automatically 30 minutes after a shift ends."
        />
      ) : (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 20 }}>
          {livePolls.map((poll) => (
            <LivePollCard
              key={poll.id}
              poll={poll}
              onClick={() => navigate('/app/live', { state: { departmentId: poll.department?.id } })}
            />
          ))}
        </div>
      )}

      <SectionHeading title="Departments" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {byDepartment.map((dept) => (
          <DepartmentCard
            key={dept.id}
            dept={dept}
            onClick={() => navigate('/app/attendance', { state: { departmentId: dept.id } })}
          />
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ title }) {
  return (
    <h2 style={{ fontSize: 15, margin: '0 0 10px', color: 'var(--ink)' }}>{title}</h2>
  );
}
