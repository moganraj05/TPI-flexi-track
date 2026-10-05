import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPollDetail, markAttendance } from '../api/hr';
import { theme, chipStyle, SUCCESS, SUCCESS_SOFT, DANGER, DANGER_SOFT, WARNING, WARNING_SOFT } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { usePagination } from '../utils/usePagination';
import { formatDate, shiftLabel } from '../utils/format';
import { useToast } from '../context/ToastContext';

const PAGE_SIZE = 10;

const ANSWER = {
  coming: { label: 'Yes', color: SUCCESS, soft: SUCCESS_SOFT },
  not_coming: { label: 'No', color: DANGER, soft: DANGER_SOFT },
  pending: { label: 'Pending', color: WARNING, soft: WARNING_SOFT },
};

export function AttendanceDetail() {
  const { pollId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  // { workerId, name, answer } — the pending worker awaiting a manual mark,
  // or null when no confirmation is open.
  const [markTarget, setMarkTarget] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr-poll-detail', pollId],
    queryFn: () => getPollDetail(pollId),
  });

  const { page, pageCount, setPage, pageItems } = usePagination(data?.summary?.teamRoster || [], PAGE_SIZE);

  const confirmMark = async () => {
    const { workerId, answer } = markTarget;
    await markAttendance(pollId, workerId, answer);
    toast(`Marked ${markTarget.name} as ${answer === 'yes' ? 'coming' : 'not coming'}`);
    setMarkTarget(null);
    // Same set SocketContext already invalidates on the poll:update broadcast
    // this action triggers — invalidated here directly too so this screen
    // (and the Attendance list's counts behind it) update immediately
    // instead of waiting on that round trip.
    queryClient.invalidateQueries({ queryKey: ['hr-poll-detail', pollId] });
    queryClient.invalidateQueries({ queryKey: ['hr-live'] });
    queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
    queryClient.invalidateQueries({ queryKey: ['hr-polls'] });
    queryClient.invalidateQueries({ queryKey: ['hr-employee', workerId] });
  };

  if (isLoading) return <CenteredSpinner label="Loading poll…" />;
  if (isError) return <EmptyState title="Could not load poll" message={error?.message} />;

  const { poll, summary } = data;

  return (
    <>
      <button onClick={() => navigate('/staff/app/attendance')} style={theme.backBtn}>
        ← Back to attendance
      </button>

      {markTarget && (
        <ConfirmDialog
          title="Mark attendance?"
          message={
            `${markTarget.name} hasn't responded to this poll. Recording "${
              markTarget.answer === 'yes' ? 'Coming' : 'Not coming'
            }" now sets this as their official attendance answer, as if HR recorded it on their behalf — if ${
              markTarget.name
            } responds themselves afterward, their answer will replace this one.` +
            (poll.status === 'closed'
              ? ' This poll has already closed — recording an answer now will still count towards its attendance totals.'
              : '')
          }
          confirmLabel={markTarget.answer === 'yes' ? 'Mark as coming' : 'Mark as not coming'}
          onConfirm={confirmMark}
          onCancel={() => setMarkTarget(null)}
        />
      )}

      <div style={theme.card}>
        <div style={theme.pollStripHead}>
          <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: theme.textPrimary }}>{shiftLabel(poll)}</span>
          <span style={{ fontSize: 13, color: theme.mutedColor }}>{formatDate(poll.date)}</span>
        </div>
        <div style={{ ...theme.statGrid, marginTop: 16 }}>
          <Stat label="Total" value={summary.totalWorkers} color={theme.textPrimary} />
          <Stat label="Coming" value={summary.coming} color={SUCCESS} />
          <Stat label="Not coming" value={summary.notComing} color={DANGER} />
          <Stat label="Pending" value={summary.pending} color={WARNING} />
          <Stat label="Response rate" value={`${summary.attendanceRate}%`} color={theme.textPrimary} />
        </div>
      </div>

      <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...theme.sectionHeader, padding: '16px 16px 0' }}>Roster & answers</div>
        <table style={theme.table}>
          <thead>
            <tr style={theme.tableHeadRow}>
              <th style={theme.th}>Worker</th>
              <th style={theme.th}>Equipment / process</th>
              <th style={theme.th}>Incharge</th>
              <th style={theme.th}>Answer</th>
              <th style={theme.th}></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => {
              const answer = ANSWER[r.status] || ANSWER.pending;
              return (
                <tr key={r.id} style={theme.tr}>
                  <td style={theme.td}>
                    <NameLinkButton onClick={() => navigate(`/staff/app/workforce/worker/${r.id}`)}>{r.name}</NameLinkButton>
                  </td>
                  <td style={theme.td}>
                    {r.equipment} · {r.process}
                  </td>
                  <td style={theme.td}>{r.incharge?.name || '—'}</td>
                  <td style={theme.td}>
                    <span style={{ background: answer.soft, color: answer.color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                      {answer.label}
                    </span>
                  </td>
                  <td style={{ ...theme.td, display: 'flex', gap: 6 }}>
                    {r.status === 'pending' && (
                      <>
                        <button
                          onClick={() => setMarkTarget({ workerId: r.id, name: r.name, answer: 'yes' })}
                          style={{ ...theme.ghostBtn, color: SUCCESS, borderColor: SUCCESS }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setMarkTarget({ workerId: r.id, name: r.name, answer: 'no' })}
                          style={{ ...theme.ghostBtn, color: DANGER, borderColor: DANGER }}
                        >
                          No
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ ...theme.settingsLabel, fontSize: 11, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: theme.mono }}>{value}</div>
    </div>
  );
}
