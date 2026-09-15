import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPollDetail } from '../api/hr';
import { theme, chipStyle, SUCCESS, SUCCESS_SOFT, DANGER, DANGER_SOFT, WARNING, WARNING_SOFT } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Pagination } from '../components/common/Pagination';
import { usePagination } from '../utils/usePagination';
import { formatDate, shiftLabel } from '../utils/format';

const PAGE_SIZE = 10;

const ANSWER = {
  coming: { label: 'Yes', color: SUCCESS, soft: SUCCESS_SOFT },
  not_coming: { label: 'No', color: DANGER, soft: DANGER_SOFT },
  pending: { label: 'Pending', color: WARNING, soft: WARNING_SOFT },
};

export function AttendanceDetail() {
  const { pollId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr-poll-detail', pollId],
    queryFn: () => getPollDetail(pollId),
  });

  const { page, pageCount, setPage, pageItems } = usePagination(data?.summary?.teamRoster || [], PAGE_SIZE);

  if (isLoading) return <CenteredSpinner label="Loading poll…" />;
  if (isError) return <EmptyState title="Could not load poll" message={error?.message} />;

  const { poll, summary } = data;

  return (
    <>
      <button onClick={() => navigate('/app/attendance')} style={theme.backBtn}>
        ← Back to attendance
      </button>

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
            </tr>
          </thead>
          <tbody>
            {pageItems.map((r) => {
              const answer = ANSWER[r.status] || ANSWER.pending;
              return (
                <tr key={r.id} style={theme.tr}>
                  <td style={theme.td}>
                    <NameLinkButton onClick={() => navigate(`/app/workforce/worker/${r.id}`)}>{r.name}</NameLinkButton>
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
