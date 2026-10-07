import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getPolls } from '../api/hr';
import { getShiftCatalog } from '../api/shifts';
import { theme, chipStyle, SUCCESS, DANGER, WARNING } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { ShiftSelect } from '../components/common/ShiftSelect';
import { Pagination } from '../components/common/Pagination';
import { formatDate, shiftLabel } from '../utils/format';

const PAGE_SIZE = 10;

export function Attendance() {
  const navigate = useNavigate();
  const [plantFilter, setPlantFilter] = useState('all');
  // '' means "all shifts"; otherwise one of the fixed catalog codes (A-E).
  const [shiftCode, setShiftCode] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

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

  const { data, isPending: isLoading } = useQuery({
    queryKey: ['hr-polls', 'closed', plantFilter, shiftCode, dateFilter, page],
    queryFn: () =>
      getPolls({
        status: 'closed',
        department: plantFilter === 'all' ? undefined : plantFilter,
        shiftStart: selectedShift?.shiftStart,
        shiftEnd: selectedShift?.shiftEnd,
        date: dateFilter || undefined,
        page,
        limit: PAGE_SIZE,
        summary: 'counts',
      }),
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  const total = data?.meta?.total ?? 0;

  const setPlant = (v) => {
    setPlantFilter(v);
    setShiftCode('');
    setDateFilter('');
    setPage(1);
  };
  const setShift = (v) => {
    setShiftCode(v);
    setPage(1);
  };
  const setDate = (v) => {
    setDateFilter(v);
    setPage(1);
  };

  return (
    <>
      <div style={theme.filterRow}>
        <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlant} />
        <ShiftSelect
          shifts={shiftCatalog || []}
          value={shiftCode}
          onChange={setShift}
          allowEmpty
          emptyLabel="All shifts"
          disabled={plantFilter === 'all'}
        />
        <input type="date" value={dateFilter} onChange={(e) => setDate(e.target.value)} style={{ ...theme.input, width: 'auto', padding: '7px 10px' }} />
        {dateFilter && (
          <button onClick={() => setDate('')} style={theme.ghostBtn}>
            Clear date
          </button>
        )}
      </div>

      {isLoading ? (
        <CenteredSpinner label="Loading closed polls…" />
      ) : total === 0 ? (
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
                      <button onClick={() => navigate(`/staff/app/attendance/${poll.id}`)} style={theme.ghostBtn}>
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
