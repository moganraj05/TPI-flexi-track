import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDepartments, getWorkforce } from '../api/hr';
import { theme, chipStyle, filterBtnStyle, SUCCESS } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Pagination } from '../components/common/Pagination';
import { usePagination } from '../utils/usePagination';

const GROUP_PAGE_SIZE = 8;

export function Workforce() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState('workers');
  const [plantFilter, setPlantFilter] = useState(() => searchParams.get('plant') || 'all');

  const { data: departments, isLoading: departmentsLoading } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments });
  const { data: people, isLoading: peopleLoading } = useQuery({ queryKey: ['hr-workforce'], queryFn: () => getWorkforce('true') });

  if (departmentsLoading || peopleLoading) return <CenteredSpinner label="Loading workforce…" />;

  const relevantDepartments = (departments || []).filter((d) => plantFilter === 'all' || d.id === plantFilter);

  return (
    <>
      <div style={theme.filterRow}>
        <button onClick={() => setView('workers')} style={filterBtnStyle(view === 'workers')}>
          Workers
        </button>
        <button onClick={() => setView('incharges')} style={filterBtnStyle(view === 'incharges')}>
          Incharges
        </button>
        <div style={{ width: 1, alignSelf: 'stretch', background: theme.borderColor, margin: '0 4px' }} />
        <FilterChips options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlantFilter} />
      </div>

      {relevantDepartments.length === 0 ? (
        <EmptyState title="No plants found" />
      ) : view === 'workers' ? (
        relevantDepartments.map((dept) => (
          <WorkerGroup
            key={dept.id}
            dept={dept}
            workers={(people || []).filter((p) => p.role === 'worker' && p.department?.id === dept.id)}
            inchargeCount={(people || []).filter((p) => p.role === 'incharge' && p.department?.id === dept.id).length}
            onOpenWorker={(id) => navigate(`/app/workforce/worker/${id}`)}
            onOpenIncharge={(id) => navigate(`/app/workforce/incharge/${id}`)}
          />
        ))
      ) : (
        relevantDepartments.map((dept) => (
          <InchargeGroup
            key={dept.id}
            dept={dept}
            incharges={(people || []).filter((p) => p.role === 'incharge' && p.department?.id === dept.id)}
            workerCountFor={(inchargeId) => (people || []).filter((p) => p.role === 'worker' && p.incharge?.id === inchargeId).length}
            onOpenIncharge={(id) => navigate(`/app/workforce/incharge/${id}`)}
          />
        ))
      )}
    </>
  );
}

function WorkerGroup({ dept, workers, inchargeCount, onOpenWorker, onOpenIncharge }) {
  const { page, pageCount, setPage, pageItems } = usePagination(workers, GROUP_PAGE_SIZE);

  return (
    <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
      <div style={theme.groupHead}>
        <span style={chipStyle(dept.code)}>{dept.code}</span>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>{dept.name}</span>
        <span style={{ fontSize: 12, color: theme.mutedColor }}>
          {inchargeCount} incharges · {workers.length} workers
        </span>
      </div>
      {workers.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: theme.textSecondary }}>No workers in this plant.</div>
      ) : (
        <>
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={theme.th}>Worker</th>
                <th style={theme.th}>Emp ID</th>
                <th style={theme.th}>Incharge</th>
                <th style={theme.th}>Equipment / process</th>
                <th style={theme.th}>Shift</th>
                <th style={theme.th}>Push</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((w) => (
                <tr key={w.id} style={theme.tr}>
                  <td style={theme.td}>
                    <NameLinkButton onClick={() => onOpenWorker(w.id)}>{w.name}</NameLinkButton>
                  </td>
                  <td style={{ ...theme.td, fontFamily: theme.mono }}>{w.employeeId}</td>
                  <td style={theme.td}>
                    {w.incharge ? <NameLinkButton onClick={() => onOpenIncharge(w.incharge.id)}>{w.incharge.name}</NameLinkButton> : '—'}
                  </td>
                  <td style={theme.td}>
                    {w.equipment} · {w.process}
                  </td>
                  <td style={theme.td}>{w.shiftName || (w.shiftStart && w.shiftEnd ? `${w.shiftStart}–${w.shiftEnd}` : '—')}</td>
                  <td style={theme.td}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        display: 'inline-block',
                        background: w.hasNotifications ? SUCCESS : theme.borderColor,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function InchargeGroup({ dept, incharges, workerCountFor, onOpenIncharge }) {
  const { page, pageCount, setPage, pageItems } = usePagination(incharges, GROUP_PAGE_SIZE);

  return (
    <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
      <div style={theme.groupHead}>
        <span style={chipStyle(dept.code)}>{dept.code}</span>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>{dept.name}</span>
        <span style={{ fontSize: 12, color: theme.mutedColor }}>{incharges.length} incharges</span>
      </div>
      {incharges.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: theme.textSecondary }}>No incharges in this plant.</div>
      ) : (
        <>
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={theme.th}>Incharge</th>
                <th style={theme.th}>Shift</th>
                <th style={theme.th}>Workers under them</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i) => (
                <tr key={i.id} style={theme.tr}>
                  <td style={theme.td}>
                    <NameLinkButton onClick={() => onOpenIncharge(i.id)}>{i.name}</NameLinkButton>
                  </td>
                  <td style={theme.td}>{i.shiftName ? `${i.shiftName} · ${i.shiftStart}–${i.shiftEnd}` : `${i.shiftStart}–${i.shiftEnd}`}</td>
                  <td style={theme.td}>{workerCountFor(i.id)} workers</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </div>
  );
}
