import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEmployee } from '../api/hr';
import { theme, chipStyle } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Avatar } from '../components/common/Avatar';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { memberShiftLabel } from '../utils/format';

export function InchargeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hr-employee', id],
    queryFn: () => getEmployee(id),
  });

  if (isLoading) return <CenteredSpinner label="Loading incharge…" />;
  if (isError) return <EmptyState title="Could not load incharge" message={error?.message} />;

  const { employee, directReports } = data;
  const workers = directReports || [];

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
              <span style={{ fontSize: 12, color: theme.mutedColor }}>Incharge</span>
            </div>
          </div>
        </div>
        <Row label="Shift" value={memberShiftLabel(employee)} />
        <Row label="Phone" value={employee.phone} />
        <Row label="Email" value={employee.email} noBorder />
      </div>

      <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...theme.sectionHeader, padding: '16px 16px 0' }}>
          Workers under {employee.name} · {workers.length}
        </div>
        {workers.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: theme.textSecondary }}>No workers reporting to this incharge yet.</div>
        ) : (
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={theme.th}>Worker</th>
                <th style={theme.th}>Emp ID</th>
                <th style={theme.th}>Equipment / process</th>
                <th style={theme.th}>Shift</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} style={theme.tr}>
                  <td style={theme.td}>
                    <NameLinkButton onClick={() => navigate(`/app/workforce/worker/${w.id}`)}>{w.name}</NameLinkButton>
                  </td>
                  <td style={{ ...theme.td, fontFamily: theme.mono }}>{w.employeeId}</td>
                  <td style={theme.td}>
                    {w.equipment} · {w.process}
                  </td>
                  <td style={theme.td}>{memberShiftLabel(w)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
