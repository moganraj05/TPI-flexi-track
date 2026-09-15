import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getPolls } from '../api/hr';
import { theme, chipStyle, SUCCESS, DANGER, WARNING } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { Pagination } from '../components/common/Pagination';
import { usePagination } from '../utils/usePagination';
import { formatDate, shiftLabel, toDateInputValue } from '../utils/format';

const PAGE_SIZE = 10;

export function Attendance() {
  const navigate = useNavigate();
  const [plantFilter, setPlantFilter] = useState('all');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments });
  const { data: polls, isLoading } = useQuery({
    queryKey: ['hr-polls', 'closed', plantFilter],
    queryFn: () => getPolls({ status: 'closed', department: plantFilter === 'all' ? undefined : plantFilter }),
  });

  const shiftOptions = useMemo(() => {
    const unique = new Set((polls || []).map((p) => shiftLabel(p)));
    return [{ value: 'all', label: 'All shifts' }, ...[...unique].sort().map((value) => ({ value, label: value }))];
  }, [polls]);

  const filteredPolls = useMemo(() => {
    let list = polls || [];
    if (shiftFilter !== 'all') list = list.filter((p) => shiftLabel(p) === shiftFilter);
    if (dateFilter) list = list.filter((p) => toDateInputValue(p.date) === dateFilter);
    return list;
  }, [polls, shiftFilter, dateFilter]);

  const { page, pageCount, setPage, pageItems } = usePagination(filteredPolls, PAGE_SIZE);

  const setPlant = (v) => {
    setPlantFilter(v);
    setShiftFilter('all');
    setDateFilter('');
    setPage(1);
  };
  const setShift = (v) => {
    setShiftFilter(v);
    setPage(1);
  };
  const setDate = (v) => {
    setDateFilter(v);
    setPage(1);
  };

  return (
    <>
      <FilterChips options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlant} />
      <div style={theme.filterRow}>
        <FilterChips options={shiftOptions} value={shiftFilter} onChange={setShift} />
        <input type="date" value={dateFilter} onChange={(e) => setDate(e.target.value)} style={{ ...theme.input, width: 'auto', padding: '7px 10px' }} />
        {dateFilter && (
          <button onClick={() => setDate('')} style={theme.ghostBtn}>
            Clear date
          </button>
        )}
      </div>

      {isLoading ? (
        <CenteredSpinner label="Loading closed polls…" />
      ) : filteredPolls.length === 0 ? (
        <EmptyState title="No closed polls found" message="Try a different plant, shift or date." />
      ) : (
        <>
          <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
            <table style={theme.table}>
              <thead>
                <tr style={theme.tableHeadRow}>
                  <th style={theme.th}>Date</th>
                  <th style={theme.th}>Plant</th>
                  <th style={theme.th}>Shift</th>
                  <th style={theme.th}>Total</th>
                  <th style={theme.th}>Coming</th>
                  <th style={theme.th}>Not coming</th>
                  <th style={theme.th}>Pending</th>
                  <th style={theme.th}>Rate</th>
                  <th style={theme.th}></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((poll) => (
                  <tr key={poll.id} style={theme.tr}>
                    <td style={{ ...theme.td, fontFamily: theme.mono }}>{formatDate(poll.date)}</td>
                    <td style={theme.td}>
                      <span style={chipStyle(poll.department?.code)}>{poll.department?.code}</span>
                    </td>
                    <td style={theme.td}>{shiftLabel(poll)}</td>
                    <td style={theme.td}>{poll.summary.totalWorkers}</td>
                    <td style={{ ...theme.td, color: SUCCESS }}>{poll.summary.coming}</td>
                    <td style={{ ...theme.td, color: DANGER }}>{poll.summary.notComing}</td>
                    <td style={{ ...theme.td, color: WARNING }}>{poll.summary.pending}</td>
                    <td style={{ ...theme.td, fontWeight: 700 }}>{poll.summary.attendanceRate}%</td>
                    <td style={theme.td}>
                      <button onClick={() => navigate(`/app/attendance/${poll.id}`)} style={theme.ghostBtn}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </>
  );
}
