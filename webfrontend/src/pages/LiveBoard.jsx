import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDepartments, getLiveBoard } from '../api/hr';
import { theme, chipStyle } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { ProgressBar, Legend } from '../components/common/ProgressBar';
import { RosterRow } from '../components/common/RosterRow';
import { Pagination } from '../components/common/Pagination';
import { usePagination } from '../utils/usePagination';
import { countdown, shiftLabel } from '../utils/format';
import { useLiveStatus } from '../context/LiveStatusContext';

const ROSTER_PAGE_SIZE = 6;

export function LiveBoard() {
  const navigate = useNavigate();
  const { setLastUpdated } = useLiveStatus();
  const [plantFilter, setPlantFilter] = useState('all');
  const [expanded, setExpanded] = useState({});

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments });
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['hr-live'],
    queryFn: getLiveBoard,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (dataUpdatedAt) setLastUpdated(dataUpdatedAt);
  }, [dataUpdatedAt, setLastUpdated]);

  if (isLoading) return <CenteredSpinner label="Loading live polls…" />;
  if (isError) return <EmptyState title="Could not load live polls" message={error?.message} />;

  const polls = (data?.polls || []).filter((p) => plantFilter === 'all' || p.department?.id === plantFilter);

  return (
    <>
      <FilterChips options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlantFilter} />

      {polls.length === 0 ? (
        <EmptyState
          title="No open polls right now"
          message="Live polls appear here 30 minutes after a shift ends, and close 2 hours before the next one starts."
        />
      ) : (
        polls.map((poll) => {
          const isExpanded = !!expanded[poll.id];
          const roster = poll.summary.teamRoster || [];
          const coming = roster.filter((m) => m.status === 'coming');
          const notComing = roster.filter((m) => m.status === 'not_coming');
          const pending = roster.filter((m) => m.status === 'pending');

          return (
            <div key={poll.id} style={theme.card}>
              <div style={theme.liveCardHead}>
                <div style={theme.pollStripHead}>
                  <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
                  <span style={{ fontWeight: 700, color: theme.textPrimary }}>{shiftLabel(poll)}</span>
                  <span style={{ fontSize: 12, color: theme.mutedColor }}>
                    {poll.opensAt && new Date(poll.opensAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    –{poll.closesAt && new Date(poll.closesAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <div style={theme.liveCardHeadRight}>
                  <span style={theme.warnBadge}>closes in {countdown(poll.closesAt)}</span>
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [poll.id]: !prev[poll.id] }))}
                    style={theme.ghostBtn}
                  >
                    {isExpanded ? 'Hide roster' : 'Show roster'}
                  </button>
                </div>
              </div>

              <ProgressBar
                coming={poll.summary.coming}
                notComing={poll.summary.notComing}
                pending={poll.summary.pending}
                total={poll.summary.totalWorkers}
              />
              <Legend
                coming={poll.summary.coming}
                notComing={poll.summary.notComing}
                pending={poll.summary.pending}
                total={poll.summary.totalWorkers}
              />

              {isExpanded && (
                <div style={theme.rosterCols}>
                  <RosterColumn title={`Coming · ${coming.length}`} color="#16a34a" people={coming} onOpen={navigate} />
                  <RosterColumn title={`Not coming · ${notComing.length}`} color="#dc2626" people={notComing} onOpen={navigate} />
                  <RosterColumn title={`Pending · ${pending.length}`} color="#b45309" people={pending} onOpen={navigate} />
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

function RosterColumn({ title, color, people, onOpen }) {
  const { page, pageCount, setPage, pageItems } = usePagination(people, ROSTER_PAGE_SIZE);

  return (
    <div>
      <div style={{ ...theme.rosterColHead, color }}>{title}</div>
      {pageItems.map((person) => (
        <RosterRow
          key={person.id}
          name={person.name}
          tag={person.equipment && person.process ? `${person.equipment} · ${person.process}` : person.employeeId}
          onClick={() => onOpen(`/app/workforce/worker/${person.id}`)}
        />
      ))}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}
