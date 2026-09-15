import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getLiveBoard } from '../api/hr';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips } from '../components/common/FilterChips';
import { RowCard } from '../components/common/RowCard';
import { WorkerDetailSheet } from '../components/common/WorkerDetailSheet';
import { countdown, shiftLabel } from '../utils/format';

export function ShiftLive() {
  const location = useLocation();
  const [department, setDepartment] = useState(location.state?.departmentId || 'all');
  const [activeMember, setActiveMember] = useState(null);
  const [activePoll, setActivePoll] = useState(null);
  const [, forceTick] = useState(0);

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments });

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['hr-live'],
    queryFn: getLiveBoard,
    refetchInterval: 8000,
  });

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const polls = useMemo(() => {
    const all = data?.polls || [];
    if (department === 'all') return all;
    return all.filter((p) => p.department?.id === department);
  }, [data, department]);

  const chipOptions = [
    { value: 'all', label: 'All' },
    ...(departments || []).map((d) => ({ value: d.id, label: d.code })),
  ];

  if (isLoading) return <CenteredSpinner label="Loading live polls…" />;

  if (isError) {
    return <EmptyState title="Could not load live polls" message={error?.message} />;
  }

  return (
    <div>
      <FilterChips options={chipOptions} value={department} onChange={setDepartment} />

      <p style={styles.updated}>
        Auto-refreshing every 8s · last updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IN')}
      </p>

      {polls.length === 0 ? (
        <EmptyState
          title="No open polls right now"
          message="Live polls appear here 30 minutes after a shift ends, and close 2 hours before the next one starts."
        />
      ) : (
        polls.map((poll) => (
          <div key={poll.id} style={styles.pollBlock}>
            <div style={styles.banner}>
              <div style={styles.bannerTop}>
                <span style={styles.liveDot} />
                <span style={styles.liveLabel}>LIVE</span>
                <span style={styles.countdown}>{countdown(poll.closesAt)}</span>
              </div>
              <p style={styles.bannerTitle}>{poll.department?.name}</p>
              <p style={styles.bannerMeta}>{shiftLabel(poll)}</p>
              <div style={styles.bannerCounts}>
                <span style={{ color: 'var(--green)' }}>{poll.summary.coming} coming</span>
                <span style={{ color: 'var(--red)' }}>{poll.summary.notComing} not coming</span>
                <span style={{ color: 'var(--amber)' }}>{poll.summary.pending} pending</span>
              </div>
            </div>

            {(poll.summary.teamRoster || []).map((member) => (
              <RowCard
                key={member.id}
                name={member.name}
                subtitle={member.employeeId}
                status={member.status}
                onClick={() => {
                  setActivePoll(poll);
                  setActiveMember(member);
                }}
              />
            ))}
          </div>
        ))
      )}

      <WorkerDetailSheet
        member={activeMember}
        poll={activePoll}
        allowOverride
        onClose={() => setActiveMember(null)}
      />
    </div>
  );
}

const styles = {
  updated: { fontSize: 11, color: 'var(--ink-soft)', margin: '0 0 14px' },
  pollBlock: { marginBottom: 22 },
  banner: {
    background: 'var(--blue-deep)',
    color: 'var(--white)',
    borderRadius: 'var(--radius-card)',
    padding: 16,
    marginBottom: 10,
  },
  bannerTop: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: '#4ADE80' },
  liveLabel: { fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: '#4ADE80' },
  countdown: { marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--blue-bright)' },
  bannerTitle: { margin: 0, fontSize: 17, fontFamily: 'Manrope, sans-serif', fontWeight: 800 },
  bannerMeta: { margin: '2px 0 10px', fontSize: 12, opacity: 0.8 },
  bannerCounts: { display: 'flex', gap: 12, fontSize: 12, fontWeight: 700, flexWrap: 'wrap' },
};
