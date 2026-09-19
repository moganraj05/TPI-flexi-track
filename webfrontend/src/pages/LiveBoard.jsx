import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDepartments, getLiveBoard, markAttendance } from '../api/hr';
import { theme, chipStyle, SUCCESS, DANGER } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { ProgressBar, Legend } from '../components/common/ProgressBar';
import { RosterRow } from '../components/common/RosterRow';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { usePagination } from '../utils/usePagination';
import { countdown, shiftLabel } from '../utils/format';
import { useLiveStatus } from '../context/LiveStatusContext';
import { useToast } from '../context/ToastContext';

const ROSTER_PAGE_SIZE = 6;

export function LiveBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { setLastUpdated } = useLiveStatus();
  const [plantFilter, setPlantFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  // { poll, person, answer } — the pending worker awaiting a manual mark, or
  // null when no confirmation is open.
  const [markTarget, setMarkTarget] = useState(null);

  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['hr-live'],
    queryFn: getLiveBoard,
    refetchInterval: 8000,
    // Always stale on purpose — this is the live coming/not-coming/pending
    // board. A fresh mount or a poll:update invalidation must refetch
    // immediately rather than waiting out the app-wide 30s staleTime.
    staleTime: 0,
  });

  useEffect(() => {
    if (dataUpdatedAt) setLastUpdated(dataUpdatedAt);
  }, [dataUpdatedAt, setLastUpdated]);

  const confirmMark = async () => {
    const { poll, person, answer } = markTarget;
    await markAttendance(poll.id, person.id, answer);
    toast(`Marked ${person.name} as ${answer === 'yes' ? 'coming' : 'not coming'}`);
    setMarkTarget(null);
    // Same set SocketContext already invalidates on a poll:update broadcast
    // (this action triggers one too) — invalidated here directly as well so
    // the board updates immediately instead of waiting on that round trip.
    queryClient.invalidateQueries({ queryKey: ['hr-live'] });
    queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
    queryClient.invalidateQueries({ queryKey: ['hr-polls'] });
    queryClient.invalidateQueries({ queryKey: ['hr-poll-detail', poll.id] });
    queryClient.invalidateQueries({ queryKey: ['hr-employee', person.id] });
  };

  if (isLoading) return <CenteredSpinner label="Loading live polls…" />;
  if (isError) return <EmptyState title="Could not load live polls" message={error?.message} />;

  const polls = (data?.polls || []).filter((p) => plantFilter === 'all' || p.department?.id === plantFilter);

  return (
    <>
      <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlantFilter} />

      {markTarget && (
        <ConfirmDialog
          title="Mark attendance?"
          message={`${markTarget.person.name} hasn't responded to this poll. Recording "${
            markTarget.answer === 'yes' ? 'Coming' : 'Not coming'
          }" now sets this as their official attendance answer, as if HR recorded it on their behalf — if ${
            markTarget.person.name
          } responds themselves afterward, their answer will replace this one.`}
          confirmLabel={markTarget.answer === 'yes' ? 'Mark as coming' : 'Mark as not coming'}
          onConfirm={confirmMark}
          onCancel={() => setMarkTarget(null)}
        />
      )}

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
                  <RosterColumn
                    title={`Pending · ${pending.length}`}
                    color="#b45309"
                    people={pending}
                    onOpen={navigate}
                    onMark={(person, answer) => setMarkTarget({ poll, person, answer })}
                  />
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

function RosterColumn({ title, color, people, onOpen, onMark }) {
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
          actions={
            onMark ? (
              <>
                <button
                  onClick={() => onMark(person, 'yes')}
                  style={{ ...theme.ghostBtn, color: SUCCESS, borderColor: SUCCESS }}
                >
                  Yes
                </button>
                <button
                  onClick={() => onMark(person, 'no')}
                  style={{ ...theme.ghostBtn, color: DANGER, borderColor: DANGER }}
                >
                  No
                </button>
              </>
            ) : undefined
          }
        />
      ))}
      <Pagination page={page} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}
