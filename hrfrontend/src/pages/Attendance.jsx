import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getPolls } from '../api/hr';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips } from '../components/common/FilterChips';
import { RowCard } from '../components/common/RowCard';
import { Pagination } from '../components/common/Pagination';
import { StatusBadge } from '../components/common/StatusBadge';
import { WorkerDetailSheet } from '../components/common/WorkerDetailSheet';
import { formatDate, shiftLabel, toDateInputValue } from '../utils/format';

const PAGE_SIZE = 20;

export function Attendance() {
  const location = useLocation();
  const [department, setDepartment] = useState(location.state?.departmentId || 'all');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedPollId, setSelectedPollId] = useState(null);
  const [page, setPage] = useState(1);
  const [activeMember, setActiveMember] = useState(null);

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments });

  const { data: polls, isLoading: pollsLoading } = useQuery({
    queryKey: ['hr-polls', 'closed', department],
    queryFn: () => getPolls({ status: 'closed', department: department === 'all' ? undefined : department }),
  });

  const filteredPolls = useMemo(() => {
    if (!polls) return [];
    if (!dateFilter) return polls;
    return polls.filter((p) => toDateInputValue(p.date) === dateFilter);
  }, [polls, dateFilter]);

  const selectedPoll = filteredPolls.find((p) => p.id === selectedPollId) || null;

  useEffect(() => {
    setPage(1);
  }, [selectedPollId]);

  useEffect(() => {
    setSelectedPollId(null);
  }, [department, dateFilter]);

  const roster = selectedPoll?.summary?.teamRoster || [];
  const pageCount = Math.max(1, Math.ceil(roster.length / PAGE_SIZE));
  const pageRoster = roster.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chipOptions = [
    { value: 'all', label: 'All' },
    ...(departments || []).map((d) => ({ value: d.id, label: d.code })),
  ];

  return (
    <div>
      <FilterChips options={chipOptions} value={department} onChange={setDepartment} />

      <input
        type="date"
        value={dateFilter}
        onChange={(e) => setDateFilter(e.target.value)}
        style={styles.dateInput}
      />

      {pollsLoading ? (
        <CenteredSpinner label="Loading closed polls…" />
      ) : filteredPolls.length === 0 ? (
        <EmptyState title="No closed polls found" message="Try a different department or date." />
      ) : !selectedPoll ? (
        <div>
          <SectionLabel text="Select a poll to view attendance" />
          {filteredPolls.map((poll) => (
            <button key={poll.id} onClick={() => setSelectedPollId(poll.id)} style={styles.pollCard}>
              <div>
                <p style={styles.pollTitle}>{poll.department?.name}</p>
                <p style={styles.pollMeta}>
                  {shiftLabel(poll)} · {formatDate(poll.date)}
                </p>
              </div>
              <div style={styles.pollCounts}>
                <span style={{ color: 'var(--green)' }}>{poll.summary.coming}</span>
                <span style={{ color: 'var(--red)' }}>{poll.summary.notComing}</span>
                <span style={{ color: 'var(--amber)' }}>{poll.summary.pending}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedPollId(null)} style={styles.backBtn}>
            ← All polls
          </button>
          <div style={styles.summaryCard}>
            <p style={styles.pollTitle}>{selectedPoll.department?.name}</p>
            <p style={styles.pollMeta}>
              {shiftLabel(selectedPoll)} · {formatDate(selectedPoll.date)}
            </p>
            <div style={styles.summaryRow}>
              <StatusBadge status="coming">{selectedPoll.summary.coming} coming</StatusBadge>
              <StatusBadge status="not_coming">{selectedPoll.summary.notComing} not coming</StatusBadge>
              <StatusBadge status="pending">{selectedPoll.summary.pending} no response</StatusBadge>
            </div>
          </div>

          <SectionLabel text={`Workers (${roster.length})`} />
          {pageRoster.map((member) => (
            <RowCard
              key={member.id}
              name={member.name}
              subtitle={member.employeeId}
              status={member.status}
              onClick={() => setActiveMember(member)}
            />
          ))}
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <WorkerDetailSheet
        member={activeMember}
        poll={selectedPoll}
        allowOverride={false}
        onClose={() => setActiveMember(null)}
      />
    </div>
  );
}

function SectionLabel({ text }) {
  return <h2 style={{ fontSize: 14, margin: '4px 0 10px', color: 'var(--ink-soft)' }}>{text}</h2>;
}

const styles = {
  dateInput: {
    width: '100%',
    border: '1px solid var(--line)',
    background: 'var(--white)',
    borderRadius: 'var(--radius-control)',
    padding: '10px 12px',
    fontSize: 13,
    marginBottom: 16,
    minHeight: 44,
    color: 'var(--ink)',
  },
  pollCard: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 14,
    marginBottom: 10,
    textAlign: 'left',
  },
  pollTitle: { margin: 0, fontSize: 14, fontWeight: 800, fontFamily: 'Manrope, sans-serif' },
  pollMeta: { margin: '2px 0 0', fontSize: 12, color: 'var(--ink-soft)' },
  pollCounts: { display: 'flex', gap: 8, fontSize: 12, fontWeight: 800 },
  backBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--blue)',
    fontWeight: 700,
    fontSize: 13,
    padding: '4px 0 12px',
  },
  summaryCard: {
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 14,
    marginBottom: 18,
  },
  summaryRow: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
};
