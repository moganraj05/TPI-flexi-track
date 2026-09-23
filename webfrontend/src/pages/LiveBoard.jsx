import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDepartments, getLiveBoard, markAttendance } from '../api/hr';
import { getShiftCatalog } from '../api/shifts';
import { theme, chipStyle, SUCCESS, SUCCESS_SOFT, DANGER, WARNING, WARNING_SOFT } from '../theme';
import { spacing, radius, elevation } from '../tokens';
import { EmptyState } from '../components/common/EmptyState';
import { plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { ShiftSelect } from '../components/common/ShiftSelect';
import { ProgressBar } from '../components/common/ProgressBar';
import { Avatar } from '../components/common/Avatar';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Table, TableHead, Th, TableRow, Td } from '../components/common/Table';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { SkeletonCard, SkeletonText } from '../components/common/Skeleton';
import { usePagination } from '../utils/usePagination';
import { countdown, formatDate, shiftLabel } from '../utils/format';
import { useLiveStatus } from '../context/LiveStatusContext';
import { useToast } from '../context/ToastContext';

const ROSTER_PAGE_SIZE = 10;

const page = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.xl },
};

const STATUS_BADGE = {
  coming: { tone: 'success', label: 'Coming' },
  not_coming: { tone: 'danger', label: 'Not coming' },
  pending: { tone: 'warning', label: 'Pending' },
};
const STATUS_RANK = { pending: 0, not_coming: 1, coming: 2 };

export function LiveBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { setLastUpdated } = useLiveStatus();
  const [plantFilter, setPlantFilter] = useState('all');
  // '' means "all shifts"; otherwise one of the fixed catalog codes (A-E).
  const [shiftCode, setShiftCode] = useState('');
  const [selectedPollId, setSelectedPollId] = useState(null);
  // { poll, person, answer } — the pending worker awaiting a manual mark, or
  // null when no confirmation is open.
  const [markTarget, setMarkTarget] = useState(null);

  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });
  const { data: shiftCatalog } = useQuery({
    queryKey: ['shift-catalog'],
    queryFn: getShiftCatalog,
    staleTime: Infinity,
  });
  const selectedShift = (shiftCatalog || []).find((s) => s.code === shiftCode);
  const { data, isLoading, isFetching, isError, error, dataUpdatedAt, refetch } = useQuery({
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

  const polls = (data?.polls || []).filter(
    (p) =>
      (plantFilter === 'all' || p.department?.id === plantFilter) &&
      (!selectedShift || (p.shiftStart === selectedShift.shiftStart && p.shiftEnd === selectedShift.shiftEnd))
  );

  // Keeps the focused poll valid as the plant filter changes or a poll
  // closes mid-session via the same realtime refresh that already drives
  // this page — falls back to the first still-open poll instead of showing
  // a stale selection.
  useEffect(() => {
    if (polls.length === 0) {
      if (selectedPollId !== null) setSelectedPollId(null);
      return;
    }
    if (!polls.some((p) => p.id === selectedPollId)) setSelectedPollId(polls[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls, selectedPollId]);

  const confirmMark = async () => {
    const { poll, person, answer } = markTarget;
    await markAttendance(poll.id, person.id, answer);
    toast(`Marked ${person.name} as ${answer === 'yes' ? 'coming' : 'not coming'}`, 'success');
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

  if (isLoading) return <LiveBoardSkeleton />;
  if (isError) return <EmptyState title="Could not load live polls" message={error?.message} icon="!" tone="danger" />;

  const selectedPoll = polls.find((p) => p.id === selectedPollId) || null;

  const setPlant = (v) => {
    setPlantFilter(v);
    setShiftCode('');
  };

  return (
    <div style={page.wrap}>
      <LiveBoardHeader
        pollCount={polls.length}
        isFetching={isFetching}
        onRefresh={refetch}
        departments={departments}
        plantFilter={plantFilter}
        onPlantFilter={setPlant}
        shiftCatalog={shiftCatalog}
        shiftCode={shiftCode}
        onShiftFilter={setShiftCode}
      />

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
          icon="✓"
          title="No live polls right now"
          message="Live polls appear here 30 minutes after a shift ends, and close 1 hour before the next one starts."
        />
      ) : (
        <>
          {polls.length > 1 && <PollSelector polls={polls} selectedId={selectedPollId} onSelect={setSelectedPollId} />}

          {selectedPoll && (
            <>
              <CurrentPollOverview poll={selectedPoll} />
              <AttendanceSummary summary={selectedPoll.summary} />
              <RosterSection
                key={selectedPoll.id}
                poll={selectedPoll}
                onOpenWorker={(id) => navigate(`/app/workforce/worker/${id}`)}
                onMark={(person, answer) => setMarkTarget({ poll: selectedPoll, person, answer })}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function LiveBoardHeader({
  pollCount,
  isFetching,
  onRefresh,
  departments,
  plantFilter,
  onPlantFilter,
  shiftCatalog,
  shiftCode,
  onShiftFilter,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: theme.textPrimary, letterSpacing: '-0.01em' }}>Live Board</div>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: SUCCESS_SOFT,
              color: SUCCESS,
              padding: '3px 10px',
              borderRadius: radius.pill,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            <span className="ft-live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: SUCCESS, display: 'inline-block' }} />
            Live
          </span>
        </div>
        <div style={{ fontSize: 13.5, color: theme.textSecondary, marginTop: 6, fontWeight: 500 }}>
          Real-time attendance as workers respond · updating every 8s
          {pollCount > 0 && ` · ${pollCount} poll${pollCount === 1 ? '' : 's'} open`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={onPlantFilter} />
        <ShiftSelect
          shifts={shiftCatalog || []}
          value={shiftCode}
          onChange={onShiftFilter}
          allowEmpty
          emptyLabel="All shifts"
          disabled={plantFilter === 'all'}
        />
        <Button variant="secondary" size="sm" onClick={() => onRefresh()} loading={isFetching} loadingLabel="Refreshing…">
          Refresh
        </Button>
      </div>
    </div>
  );
}

function PollSelector({ polls, selectedId, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
      {polls.map((poll) => {
        const active = poll.id === selectedId;
        return (
          <button
            key={poll.id}
            className="ft-btn"
            onClick={() => onSelect(poll.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: radius.pill,
              border: `1px solid ${active ? theme.accent : theme.borderColor}`,
              background: active ? theme.accent : theme.surface,
              color: active ? '#fff' : theme.textPrimary,
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
            {formatDate(poll.date)}
          </button>
        );
      })}
    </div>
  );
}

function CurrentPollOverview({ poll }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: spacing.lg, boxShadow: elevation.card }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: theme.textPrimary }}>{shiftLabel(poll)}</span>
          <Badge tone="success">OPEN</Badge>
        </div>
        <Badge tone="warning">closes in {countdown(poll.closesAt)}</Badge>
      </div>
      <div style={{ fontSize: 13, color: theme.mutedColor, marginTop: 6 }}>
        {poll.opensAt && new Date(poll.opensAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
        {' – '}
        {poll.closesAt && new Date(poll.closesAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
      </div>
      <div style={{ marginTop: spacing.md }}>
        <ProgressBar coming={poll.summary.coming} notComing={poll.summary.notComing} pending={poll.summary.pending} total={poll.summary.totalWorkers} />
      </div>
    </div>
  );
}

function AttendanceSummary({ summary }) {
  const items = [
    { key: 'coming', label: 'Coming', value: summary.coming, tone: SUCCESS },
    { key: 'notComing', label: 'Not coming', value: summary.notComing, tone: DANGER },
    { key: 'pending', label: 'Pending', value: summary.pending, tone: WARNING },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.base }}>
      {items.map((item) => (
        <div
          key={item.key}
          className="ft-card-hover"
          style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderTop: `3px solid ${item.tone}`, borderRadius: radius.lg, padding: spacing.base }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
          <div key={item.value} className="ft-fade-in" style={{ fontSize: 32, fontWeight: 800, fontFamily: theme.mono, color: item.tone, marginTop: 6, lineHeight: 1 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function RosterSection({ poll, onOpenWorker, onMark }) {
  const roster = poll.summary.teamRoster || [];
  const sorted = [...roster].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || a.name.localeCompare(b.name)
  );
  const { page: currentPage, pageCount, setPage, pageItems } = usePagination(sorted, ROSTER_PAGE_SIZE);
  const pendingCount = roster.filter((m) => m.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {pendingCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: WARNING_SOFT,
            border: `1px solid ${WARNING}33`,
            borderRadius: radius.md,
            padding: `${spacing.sm}px ${spacing.base}px`,
            fontSize: 13,
            color: theme.textPrimary,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: WARNING, flexShrink: 0 }} />
          {pendingCount} worker{pendingCount === 1 ? '' : 's'} haven&apos;t responded yet
        </div>
      )}

      <div style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, overflow: 'hidden' }}>
        {roster.length === 0 ? (
          <div style={{ padding: spacing.lg, textAlign: 'center', fontSize: 13, color: theme.mutedColor }}>No workers assigned to this poll.</div>
        ) : (
          <Table>
            <TableHead>
              <Th>Worker</Th>
              <Th>Team</Th>
              <Th>Status</Th>
              <Th></Th>
            </TableHead>
            <tbody>
              {pageItems.map((person) => (
                <RosterTableRow key={person.id} person={person} onOpen={() => onOpenWorker(person.id)} onMark={onMark} />
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}

function RosterTableRow({ person, onOpen, onMark }) {
  const status = STATUS_BADGE[person.status] || STATUS_BADGE.pending;
  const isPending = person.status === 'pending';
  const team = person.equipment && person.process ? `${person.equipment} · ${person.process}` : person.employeeId;

  return (
    <TableRow className={isPending ? 'ft-row-pending' : undefined}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={person.name} size={30} />
          <NameLinkButton onClick={onOpen}>{person.name}</NameLinkButton>
        </div>
      </Td>
      <Td>
        <span style={{ fontSize: 13, color: theme.textSecondary }}>{team}</span>
      </Td>
      <Td>
        <span key={person.status} className="ft-fade-in" style={{ display: 'inline-block' }}>
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      </Td>
      <Td>
        {isPending && onMark ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="success" size="sm" onClick={() => onMark(person, 'yes')}>
              Yes
            </Button>
            <Button variant="danger" size="sm" onClick={() => onMark(person, 'no')}>
              No
            </Button>
          </div>
        ) : null}
      </Td>
    </TableRow>
  );
}

// Layout-shaped placeholder for the one-time initial load (no cached data
// yet) — never appears again after the first successful fetch: the 8s poll
// and Socket.IO invalidations only set `isFetching`, not `isLoading`, so the
// already-rendered board never gets replaced by this on a normal refresh.
function LiveBoardSkeleton() {
  return (
    <div style={page.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <SkeletonText width={160} height={26} />
          <div style={{ marginTop: 8 }}>
            <SkeletonText width={280} height={13} />
          </div>
        </div>
        <SkeletonText width={140} height={36} />
      </div>
      <SkeletonCard lines={3} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.base }}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <SkeletonCard lines={5} />
    </div>
  );
}
