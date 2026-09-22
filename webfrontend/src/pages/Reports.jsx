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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // Checked client-side too (not just left to the backend's own 400) so an
  // obviously-bad range shows an inline message immediately instead of
  // waiting on a round trip that was always going to fail.
  const rangeInvalid = !!(fromDate && toDate && fromDate > toDate);

  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['hr-polls', status, plantFilter, fromDate, toDate, page],
    queryFn: () =>
      getPolls({
        status,
        department: plantFilter === 'all' ? undefined : plantFilter,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: PAGE_SIZE,
        summary: 'counts',
      }),
    enabled: !rangeInvalid,
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  const total = data?.meta?.total ?? 0;

  const setPlant = (v) => {
    setPlantFilter(v);
    setPage(1);
  };
  const setStatusFilter = (v) => {
    setStatus(v);
    setPage(1);
  };
  const setFrom = (v) => {
    setFromDate(v);
    setPage(1);
  };
  const setTo = (v) => {
    setToDate(v);
    setPage(1);
  };
  const clearRange = () => {
    setFromDate('');
    setToDate('');
    setPage(1);
  };

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
          Excel export across all recent polls, every plant{fromDate || toDate ? ' — within the date range selected below' : ''}.
        </div>
        <button
          onClick={() =>
            runExport(
              () => downloadManpowerExcel({ status, fromDate: fromDate || undefined, toDate: toDate || undefined }),
              'manpower'
            )
          }
          disabled={busy === 'manpower' || rangeInvalid}
          style={{ ...theme.primaryBtnInline, opacity: busy === 'manpower' || rangeInvalid ? 0.7 : 1 }}
        >
          {busy === 'manpower' ? 'Exporting…' : 'Export Manpower.xlsx'}
        </button>
      </div>

      {error && <div style={theme.errorText}>{error}</div>}

      <div style={theme.filterRow}>
        <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlant} />
        <FilterChips
          options={[
            { value: 'closed', label: 'Closed polls' },
            { value: 'open', label: 'Open polls' },
          ]}
          value={status}
          onChange={setStatusFilter}
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFrom(e.target.value)}
          style={{ ...theme.input, width: 'auto', padding: '7px 10px' }}
          aria-label="From date"
        />
        <span style={{ color: theme.mutedColor, fontSize: 13 }}>to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setTo(e.target.value)}
          style={{ ...theme.input, width: 'auto', padding: '7px 10px' }}
          aria-label="To date"
        />
        {(fromDate || toDate) && (
          <button onClick={clearRange} style={theme.ghostBtn}>
            Clear dates
          </button>
        )}
      </div>

      {rangeInvalid && <div style={theme.errorText}>"From" date must be on or before "To" date.</div>}

      <div style={theme.sectionHeader}>Per-poll exports</div>
      {rangeInvalid ? null : isLoading ? (
        <CenteredSpinner label="Loading polls…" />
      ) : total === 0 ? (
        <EmptyState title="No polls found" message="Try a different plant, status or date range." />
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
