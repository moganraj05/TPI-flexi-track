import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEmployee } from '../api/hr';
import { theme, chipStyle, SUCCESS, SUCCESS_SOFT } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Avatar } from '../components/common/Avatar';
import { RosterRow } from '../components/common/RosterRow';
import { Pagination } from '../components/common/Pagination';
import { formatDate } from '../utils/format';

const HISTORY_PAGE_SIZE = 10;

export function WorkerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  // This route can in principle show a different worker (:id changes)
  // without the component unmounting — reset back to page 1 so a new
  // worker's history doesn't open wherever the previous one's pagination
  // happened to be left.
  useEffect(() => {
    setPage(1);
  }, [id]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['hr-employee', id, page],
    queryFn: () => getEmployee(id, { page, limit: HISTORY_PAGE_SIZE }),
  });

  // Safety clamp for a page that no longer exists (e.g. requested before a
  // resync, or reached some other way) — snap back to the last real page
  // instead of rendering a false "no responses" empty state.
  useEffect(() => {
    if (data?.meta?.pageCount && page > data.meta.pageCount) {
      setPage(data.meta.pageCount);
    }
  }, [data, page]);

  if (isLoading) return <CenteredSpinner label="Loading worker…" />;
  if (isError) return <EmptyState title="Could not load worker" message={error?.message} />;

  const { employee, history, meta } = data;
  const incharge = employee.incharge;
  const pageCount = meta?.pageCount || 1;

  return (
    <>
      <button onClick={() => navigate(-1)} style={theme.backBtn}>
        ← Back
      </button>

      <div style={theme.card}>
        <div style={theme.detailHeaderRow}>
          <Avatar name={employee.name} size={56} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.textPrimary }}>{employee.name}</div>
            <div style={{ ...theme.pollStripHead, marginTop: 4 }}>
              <span style={chipStyle(employee.department?.code)}>{employee.department?.code}</span>
              <span style={{ fontSize: 12, color: theme.mutedColor }}>{employee.employeeId}</span>
            </div>
          </div>
        </div>
        <Row label="Equipment" value={employee.equipment} />
        <Row label="Process" value={employee.process} />
        <Row label="Shift" value={employee.shiftName ? `${employee.shiftName} · ${employee.shiftStart}–${employee.shiftEnd}` : `${employee.shiftStart}–${employee.shiftEnd}`} />
        <Row label="Phone" value={employee.phone} />
        <Row label="Email" value={employee.email} />
        <Row
          label="Push notifications"
          value={
            <span
              style={{
                background: employee.hasNotifications ? SUCCESS_SOFT : theme.borderColor,
                color: employee.hasNotifications ? SUCCESS : theme.textSecondary,
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 6,
              }}
            >
              {employee.hasNotifications ? 'Enabled' : 'Disabled'}
            </span>
          }
          noBorder
        />
      </div>

      {incharge && (
        <div style={theme.card}>
          <div style={{ ...theme.sectionHeader, marginTop: 0, marginBottom: 10 }}>Reports to</div>
          <RosterRow
            name={incharge.name}
            tag={incharge.shiftName ? `${incharge.shiftName} · ${incharge.shiftStart}–${incharge.shiftEnd}` : `${incharge.shiftStart}–${incharge.shiftEnd}`}
            onClick={() => navigate(`/app/workforce/incharge/${incharge.id}`)}
          />
        </div>
      )}

      <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...theme.sectionHeader, padding: '16px 16px 0' }}>Recent responses</div>
        {history.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: theme.textSecondary }}>No poll responses yet.</div>
        ) : (
          <>
            <table style={theme.table}>
              <thead>
                <tr style={theme.tableHeadRow}>
                  <th style={theme.th}>Date</th>
                  <th style={theme.th}>Poll</th>
                  <th style={theme.th}>Answer</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={theme.tr}>
                    <td style={theme.td}>{formatDate(h.poll?.date)}</td>
                    <td style={theme.td}>{h.poll?.title || '—'}</td>
                    <td style={theme.td}>{h.answer === 'yes' ? 'Coming' : 'Not coming'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} disabled={isFetching} />
          </>
        )}
      </div>
    </>
  );
}

function Row({ label, value, noBorder }) {
  return (
    <div style={{ ...theme.settingsRow, ...(noBorder ? { borderBottom: 'none' } : null) }}>
      <span style={theme.settingsLabel}>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}
