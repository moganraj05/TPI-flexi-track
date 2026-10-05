import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '../../components/BottomSheet';
import { Icon } from '../../components/Icon';
import { Avatar, Button, ErrorState, FilterChips, Loading, StatusPill } from '../../components/ui';
import { useMobileToast } from '../../context/ToastContext';
import { useInchargePoll, usePollCountdown } from '../../hooks';
import { api } from '../../api';
import { downloadPollReportCsv, formatDisplayDate, formatDisplayDateTime, formatShiftLabel, pollDate, shiftName } from '../../utils';

const ROSTER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'coming', label: 'Coming' },
  { value: 'not_coming', label: 'Not coming' },
  { value: 'pending', label: 'No response' },
];

// Incharge poll report: live countdown, head count, the whole roster with
// each answer, "Close early" while live and a CSV export once closed.
export function InchargePollDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useInchargePoll(id);
  const goBack = () => navigate('/incharge', { replace: true });

  if (query.isLoading) {
    return (
      <div className="m-screen m-screen-plain">
        <Loading />
      </div>
    );
  }

  if (query.isError && !query.data) {
    const notFound = query.error?.status === 404 || query.error?.status === 403;
    return (
      <div className="m-screen m-screen-plain">
        <TopRow onBack={goBack} />
        <div className="m-body">
          {notFound ? (
            <div className="m-card m-empty">
              <Icon name="clipboard" size={30} className="m-text-muted" />
              <div className="m-empty-title">Poll not found</div>
              <p className="m-empty-text">It may belong to another department.</p>
              <Button variant="field" onClick={goBack}>
                Back to polls
              </Button>
            </div>
          ) : (
            <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
          )}
        </div>
      </div>
    );
  }

  return <PollDetailContent poll={query.data.data.poll} summary={query.data.data.summary} onBack={goBack} />;
}

function TopRow({ onBack, live }) {
  return (
    <div className="m-detail-top">
      <button type="button" className="m-round-btn m-round-btn-lg" onClick={onBack} aria-label="Back to polls">
        <Icon name="chevron-left" size={20} />
      </button>
      {live !== undefined ? (
        <span className={`m-status-chip ${live ? 'm-status-chip-live' : ''}`}>
          <span className="m-status-chip-dot" />
          {live ? 'Live' : 'Closed'}
        </span>
      ) : null}
    </div>
  );
}

function PollDetailContent({ poll, summary, onBack }) {
  const queryClient = useQueryClient();
  const toast = useMobileToast();
  const [rosterFilter, setRosterFilter] = useState('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [expired, setExpired] = useState(false);

  const countdown = usePollCountdown(poll.opensAt, poll.closesAt, () => {
    setExpired(true);
    queryClient.invalidateQueries({ queryKey: ['m', 'incharge-poll', poll.id] });
  });

  const live = poll.status === 'open' && !expired && !countdown.isExpired;
  const roster = useMemo(() => summary.teamRoster ?? [], [summary]);
  const filteredRoster = useMemo(
    () => (rosterFilter === 'all' ? roster : roster.filter((m) => m.status === rosterFilter)),
    [roster, rosterFilter]
  );
  const total = summary.totalWorkers ?? 0;
  const pending = summary.pending ?? summary.pendingWorkers?.length ?? 0;
  const pct = (n) => (total > 0 ? (n / total) * 100 : 0);

  const handleClose = async () => {
    setClosing(true);
    try {
      await api.closePoll(poll.id);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['m', 'incharge-poll', poll.id] });
      queryClient.invalidateQueries({ queryKey: ['m', 'incharge-polls'] });
      toast('Poll closed', 'Report ready to export');
    } catch (error) {
      setConfirmOpen(false);
      toast(error.message || 'Failed to close poll', null, { variant: 'error' });
    } finally {
      setClosing(false);
    }
  };

  const handleExport = () => {
    try {
      const filename = downloadPollReportCsv(poll, summary);
      toast('Report downloaded', filename);
    } catch (error) {
      toast(error.message || 'Failed to export report', null, { variant: 'error' });
    }
  };

  return (
    <div className="m-screen m-screen-plain">
      <TopRow onBack={onBack} live={live} />

      <div className="m-title-block">
        <h1 className="m-title">{shiftName(poll.shift)} attendance</h1>
        <p className="m-subtitle">
          For the shift starting {formatDisplayDate(pollDate(poll.date))}, {formatShiftLabel(poll.shiftStart, poll.shiftEnd)}
        </p>
      </div>

      <div className="m-body">
        <section className="m-card m-summary">
          <div className="m-timeline">
            <div>
              <div className="m-timeline-label">Opened</div>
              <div className="m-timeline-value">{formatDisplayDateTime(poll.opensAt)}</div>
            </div>
            <span className="m-timeline-dots" aria-hidden="true">
              <i className="m-fill-go" />
              <b />
              <i className="m-fill-stop" />
            </span>
            <div className="m-align-end">
              <div className="m-timeline-label">{live ? 'Closes' : 'Closed'}</div>
              <div className="m-timeline-value">{poll.closesAt ? formatDisplayDateTime(poll.closesAt) : '—'}</div>
            </div>
          </div>

          {live ? (
            <div className="m-close-strip">
              <div>
                <div className="m-close-strip-label">Closes in</div>
                <div className="m-close-strip-note">
                  <Icon name="bell" size={13} /> Auto-reminder {poll.reminderMinutesBefore ?? 30} min before close
                </div>
              </div>
              <span className="m-close-strip-value">{countdown.display}</span>
            </div>
          ) : null}

          <div className="m-segment-bar" role="img" aria-label={`${summary.coming} coming, ${summary.notComing} not coming, ${pending} no response`}>
            <span className="m-fill-go" style={{ width: `${pct(summary.coming)}%` }} />
            <span className="m-fill-stop" style={{ width: `${pct(summary.notComing)}%` }} />
          </div>

          <div className="m-summary-tiles">
            <SummaryTile label="Coming" value={summary.coming} tone="go" />
            <SummaryTile label="Not coming" value={summary.notComing} tone="stop" />
            <SummaryTile label="No response" value={pending} tone="ink" />
          </div>
        </section>

        {live ? (
          <Button variant="dangerSoft" block onClick={() => setConfirmOpen(true)}>
            Close early
          </Button>
        ) : (
          <Button variant="primary" block onClick={handleExport} icon={<Icon name="download" size={18} />}>
            Export report (.csv)
          </Button>
        )}

        <div className="m-roster-head">
          <h2 className="m-section-title">
            Team responses <span className="m-text-muted">{roster.length}</span>
          </h2>
          <FilterChips label="Filter responses" value={rosterFilter} onChange={setRosterFilter} options={ROSTER_FILTERS} />
        </div>

        <section className="m-card m-list-card">
          {filteredRoster.length === 0 ? (
            <p className="m-list-empty">No team members in this filter</p>
          ) : (
            filteredRoster.map((member) => <RosterRow key={member.id} member={member} />)
          )}
        </section>
      </div>

      <BottomSheet open={confirmOpen} onClose={() => !closing && setConfirmOpen(false)} labelledBy="close-poll-title">
        <span className="m-sheet-icon m-tint-stop">
          <Icon name="alert" size={26} />
        </span>
        <h2 id="close-poll-title" className="m-sheet-title">
          Close this poll early?
        </h2>
        <p className="m-sheet-body">
          {pending
            ? `${pending} ${pending === 1 ? 'worker hasn’t' : 'workers haven’t'} answered. They'll be recorded as no response, and nobody can change their answer after this.`
            : 'Nobody can change their answer after this.'}
        </p>
        <div className="m-sheet-actions">
          <Button variant="field" onClick={() => setConfirmOpen(false)} disabled={closing}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleClose} loading={closing}>
            Close poll
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function SummaryTile({ label, value, tone }) {
  return (
    <div className="m-summary-tile">
      <span className={`m-summary-value m-text-${tone}`}>{value}</span>
      <span className="m-summary-label">{label}</span>
    </div>
  );
}

function RosterRow({ member }) {
  const label = member.status === 'coming' ? 'Coming' : member.status === 'not_coming' ? 'Not coming' : 'No response';
  const tone = member.status === 'coming' ? 'go' : member.status === 'not_coming' ? 'stop' : 'muted';
  return (
    <div className="m-row">
      <Avatar name={member.name} employeeId={member.employeeId} size={42} />
      <div className="m-row-main">
        <div className="m-row-title">{member.name}</div>
        <div className="m-row-meta m-mono">{member.employeeId}</div>
      </div>
      <StatusPill label={label} tone={tone} />
    </div>
  );
}
