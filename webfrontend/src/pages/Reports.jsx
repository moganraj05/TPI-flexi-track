import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getPolls, downloadManpowerExcel, downloadPollExcel, downloadPollPdf } from '../api/hr';
import { theme, chipStyle } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { Pagination } from '../components/common/Pagination';
import { formatDate, shiftLabel } from '../utils/format';

const PAGE_SIZE = 10;

export function Reports() {
  const [plantFilter, setPlantFilter] = useState('all');
  const [status, setStatus] = useState('closed');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['hr-polls', status, plantFilter, page],
    queryFn: () =>
      getPolls({
        status,
        department: plantFilter === 'all' ? undefined : plantFilter,
        page,
        limit: PAGE_SIZE,
        summary: 'counts',
      }),
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  const total = data?.meta?.total ?? 0;

  const runExport = async (fn, key) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div style={theme.card}>
        <div style={{ fontWeight: 700, fontSize: 16, color: theme.textPrimary, marginBottom: 4 }}>Bulk manpower export</div>
        <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 16 }}>
          Excel export across all recent polls, every plant.
        </div>
        <button
          onClick={() => runExport(() => downloadManpowerExcel(status), 'manpower')}
          disabled={busy === 'manpower'}
          style={{ ...theme.primaryBtnInline, opacity: busy === 'manpower' ? 0.7 : 1 }}
        >
          {busy === 'manpower' ? 'Exporting…' : 'Export Manpower.xlsx'}
        </button>
      </div>

      {error && <div style={theme.errorText}>{error}</div>}

      <div style={theme.filterRow}>
        <PlantSelect
          options={plantFilterOptions(departments)}
          value={plantFilter}
          onChange={(v) => {
            setPlantFilter(v);
            setPage(1);
          }}
        />
        <FilterChips
          options={[
            { value: 'closed', label: 'Closed polls' },
            { value: 'open', label: 'Open polls' },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>

      <div style={theme.sectionHeader}>Per-poll exports</div>
      {isLoading ? (
        <CenteredSpinner label="Loading polls…" />
      ) : total === 0 ? (
        <EmptyState title="No polls found" message="Try a different plant or status." />
      ) : (
        <>
        <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={theme.th}>Date</th>
                <th style={theme.th}>Plant</th>
                <th style={theme.th}>Shift</th>
                <th style={theme.th}>Rate</th>
                <th style={theme.th}></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((poll) => {
                const hint = `${poll.department?.code || 'DEPT'}_${poll.id.slice(-6)}`;
                return (
                  <tr key={poll.id} style={theme.tr}>
                    <td style={{ ...theme.td, fontFamily: theme.mono }}>{formatDate(poll.date)}</td>
                    <td style={theme.td}>
                      <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
                    </td>
                    <td style={theme.td}>{shiftLabel(poll)}</td>
                    <td style={theme.td}>{poll.summary.attendanceRate}%</td>
                    <td style={{ ...theme.td, display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => runExport(() => downloadPollExcel(poll.id, hint), `xlsx-${poll.id}`)}
                        disabled={busy === `xlsx-${poll.id}`}
                        style={theme.ghostBtn}
                      >
                        Excel
                      </button>
                      <button
                        onClick={() => runExport(() => downloadPollPdf(poll.id, hint), `pdf-${poll.id}`)}
                        disabled={busy === `pdf-${poll.id}`}
                        style={theme.ghostBtn}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </>
  );
}
