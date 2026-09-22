import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDepartments, getWorkforce, createTeamMember, updateTeamMember, deactivateTeamMember } from '../api/hr';
import { theme, chipStyle, SUCCESS } from '../theme';
import { spacing, radius, elevation } from '../tokens';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Table, TableHead, Th, TableRow, Td } from '../components/common/Table';
import { SkeletonTableRows } from '../components/common/Skeleton';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useToast } from '../context/ToastContext';

const GROUP_PAGE_SIZE = 8;

// Maps the page's 3-way status filter to the `active` query param
// getWorkforce already accepts server-side (hr.controller.js) — 'true' is
// its default (and this page's unchanged default view), so 'active' doesn't
// need to send anything explicit, but being explicit here costs nothing and
// keeps the mapping in one obvious place.
const activeParamFor = (statusFilter) => (statusFilter === 'all' ? 'all' : statusFilter === 'inactive' ? 'false' : 'true');

const VIEW_OPTIONS = [
  { value: 'workers', label: 'Workers' },
  { value: 'incharges', label: 'Incharges' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
];

export function Workforce() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState('workers');
  const [plantFilter, setPlantFilter] = useState(() => searchParams.get('plant') || 'all');
  // 'active' is the page's existing default and stays that way — this just
  // adds a way to look at the other two without changing what loads first.
  const [statusFilter, setStatusFilter] = useState('active');
  const [formTarget, setFormTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [reactivateTarget, setReactivateTarget] = useState(null);

  // Plant list + head counts change only on explicit plant/team CRUD, all
  // of which already call invalidateQueries(['hr-departments']) — so a long
  // staleTime here only cuts redundant refetches, it never risks staleness.
  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });

  if (departmentsLoading) return <CenteredSpinner label="Loading workforce…" />;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hr-workforce'] });
    queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
    // Team create/update/deactivate/reactivate doesn't emit a Socket.IO
    // event (only poll activity does), so without this a worker/incharge
    // detail page already cached from earlier in the session would keep
    // showing pre-edit data if opened right after a change made here.
    queryClient.invalidateQueries({ queryKey: ['hr-employee'] });
  };

  const confirmDeactivate = async () => {
    const member = deactivateTarget;
    const label = member.role === 'worker' ? 'Worker' : 'Incharge';
    await deactivateTeamMember(member.id);
    toast(`${label} deactivated`, 'success');
    setDeactivateTarget(null);
    refresh();
  };

  const confirmReactivate = async () => {
    const member = reactivateTarget;
    const label = member.role === 'worker' ? 'Worker' : 'Incharge';
    // Same isActive:true capability updateDepartment/updateHrAdmin already
    // use in Settings.jsx for plants and HR logins — nothing new backend-side.
    await updateTeamMember(member.id, { isActive: true });
    toast(`${label} reactivated`, 'success');
    setReactivateTarget(null);
    refresh();
  };

  const relevantDepartments = (departments || []).filter((d) => plantFilter === 'all' || d.id === plantFilter);
  const defaultDeptId = plantFilter !== 'all' ? plantFilter : departments?.[0]?.id;
  const activeWorkerTotal = (departments || []).reduce((sum, d) => sum + (d.workers || 0), 0);
  const activeInchargeTotal = (departments || []).reduce((sum, d) => sum + (d.incharges || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      <WorkforceHeader
        plantCount={(departments || []).length}
        activeWorkerTotal={activeWorkerTotal}
        activeInchargeTotal={activeInchargeTotal}
        onAddWorker={() => setFormTarget({ mode: 'add', role: 'worker', department: defaultDeptId })}
        onAddIncharge={() => setFormTarget({ mode: 'add', role: 'incharge', department: defaultDeptId })}
      />

      <WorkforceSummary plantCount={(departments || []).length} activeWorkerTotal={activeWorkerTotal} activeInchargeTotal={activeInchargeTotal} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: `${spacing.sm}px ${spacing.base}px` }}>
        <FilterChips options={VIEW_OPTIONS} value={view} onChange={setView} />
        <div style={{ width: 1, alignSelf: 'stretch', background: theme.borderColor }} />
        <FilterChips options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <div style={{ width: 1, alignSelf: 'stretch', background: theme.borderColor }} />
        <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlantFilter} />
      </div>

      {formTarget && (
        <MemberFormPanel
          target={formTarget}
          departments={departments || []}
          onCancel={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            refresh();
          }}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title={`Deactivate ${deactivateTarget.role === 'worker' ? 'worker' : 'incharge'}?`}
          message={`${deactivateTarget.name} will no longer be able to log in or appear in active lists. You can reactivate them later from the Inactive filter on this page.`}
          confirmWord={deactivateTarget.name}
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {reactivateTarget && (
        <ConfirmDialog
          title={`Reactivate ${reactivateTarget.role === 'worker' ? 'worker' : 'incharge'}?`}
          message={`${reactivateTarget.name} will be able to log in again and will appear in active lists, dashboards and live polls.`}
          confirmLabel="Reactivate"
          onConfirm={confirmReactivate}
          onCancel={() => setReactivateTarget(null)}
        />
      )}

      {relevantDepartments.length === 0 ? (
        <EmptyState icon="—" title="No plants found" message="Try a different plant filter." />
      ) : view === 'workers' ? (
        relevantDepartments.map((dept) => (
          <WorkerGroup
            key={`${dept.id}-${statusFilter}`}
            dept={dept}
            statusFilter={statusFilter}
            onOpenWorker={(id) => navigate(`/app/workforce/worker/${id}`)}
            onOpenIncharge={(id) => navigate(`/app/workforce/incharge/${id}`)}
            onEdit={(member) => setFormTarget({ mode: 'edit', member })}
            onDeactivate={setDeactivateTarget}
            onReactivate={setReactivateTarget}
          />
        ))
      ) : (
        relevantDepartments.map((dept) => (
          <InchargeGroup
            key={`${dept.id}-${statusFilter}`}
            dept={dept}
            statusFilter={statusFilter}
            onOpenIncharge={(id) => navigate(`/app/workforce/incharge/${id}`)}
            onEdit={(member) => setFormTarget({ mode: 'edit', member })}
            onDeactivate={setDeactivateTarget}
            onReactivate={setReactivateTarget}
          />
        ))
      )}
    </div>
  );
}

function WorkforceHeader({ plantCount, activeWorkerTotal, activeInchargeTotal, onAddWorker, onAddIncharge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: theme.textPrimary, letterSpacing: '-0.01em' }}>Workforce</div>
        <div style={{ fontSize: 13.5, color: theme.textSecondary, marginTop: 6, fontWeight: 500 }}>
          Manage workers and incharges across every plant · {plantCount} plant{plantCount === 1 ? '' : 's'} ·{' '}
          {activeWorkerTotal} active workers · {activeInchargeTotal} active incharges
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="secondary" onClick={onAddIncharge}>
          + Add incharge
        </Button>
        <Button variant="primary" onClick={onAddWorker}>
          + Add worker
        </Button>
      </div>
    </div>
  );
}

// Three distinguished tiers rather than one undifferentiated row: plant
// count is context, active workers is the primary/emphasized metric (the
// number HR cares about first), active incharges is secondary. Matches the
// same elevated, color-topped tile language established on the redesigned
// Dashboard and Live Board. Figures come straight from the departments
// list already loaded above (the same per-department `workers`/`incharges`
// head counts the page already used) — this endpoint only reports active
// head counts, so an "inactive" total isn't shown here rather than guessed.
function WorkforceSummary({ plantCount, activeWorkerTotal, activeInchargeTotal }) {
  const items = [
    { key: 'workers', label: 'Active workers', value: activeWorkerTotal, tone: SUCCESS, emphasize: true },
    { key: 'incharges', label: 'Active incharges', value: activeInchargeTotal, tone: theme.accent, emphasize: false },
    { key: 'plants', label: 'Plants', value: plantCount, tone: theme.accent, emphasize: false },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.base }}>
      {items.map((item) => (
        <div
          key={item.key}
          className="ft-card-hover"
          style={{
            background: theme.surface,
            border: `1px solid ${theme.borderColor}`,
            borderTop: `3px solid ${item.tone}`,
            borderRadius: radius.lg,
            padding: spacing.lg,
            boxShadow: elevation.card,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
          <div
            key={item.value}
            className="ft-fade-in"
            style={{ fontSize: item.emphasize ? 36 : 24, fontWeight: 800, fontFamily: theme.mono, color: item.tone, marginTop: 8, lineHeight: 1 }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberFormPanel({ target, departments, onCancel, onSaved }) {
  const isEdit = target.mode === 'edit';
  const member = target.member;
  const role = isEdit ? member.role : target.role;

  const [employeeId, setEmployeeId] = useState(isEdit ? member.employeeId : '');
  const [name, setName] = useState(isEdit ? member.name : '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(isEdit ? member.phone || '' : '');
  const [email, setEmail] = useState(isEdit ? member.email || '' : '');
  const [department, setDepartment] = useState(isEdit ? member.department?.id : target.department);
  const [shiftName, setShiftName] = useState(isEdit ? member.shiftName || '' : '');
  const [shiftStart, setShiftStart] = useState(isEdit ? member.shiftStart || '08:00' : '08:00');
  const [shiftEnd, setShiftEnd] = useState(isEdit ? member.shiftEnd || '20:00' : '20:00');
  const [equipment, setEquipment] = useState(isEdit ? member.equipment || '' : '');
  const [processField, setProcessField] = useState(isEdit ? member.process || '' : '');
  const [incharge, setIncharge] = useState(isEdit ? member.incharge?.id || '' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Only the incharges of the plant currently selected in the form, fetched
  // on demand — this used to be derived from a full workforce list held in
  // the parent purely to populate this dropdown.
  const { data: inchargeData } = useQuery({
    queryKey: ['hr-workforce', 'incharge-options', department],
    queryFn: () => getWorkforce({ role: 'incharge', department, limit: 200 }),
    enabled: !!department,
  });
  const inchargeOptions = inchargeData?.items || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Name is required');
    if (!department) return setError('Plant is required');
    if (!isEdit && !employeeId.trim()) return setError('Employee ID is required');
    if (!isEdit && !password) return setError('Password is required');
    if (password && password.length < 6) return setError('Password must be at least 6 characters');

    setSaving(true);
    try {
      const shared = {
        name,
        phone,
        email,
        department,
        shiftStart,
        shiftEnd,
        shiftName,
        ...(role === 'worker' ? { equipment, process: processField, incharge: incharge || null } : {}),
        ...(password ? { password } : {}),
      };

      if (isEdit) {
        await updateTeamMember(member.id, shared);
      } else {
        await createTeamMember({ ...shared, employeeId, role, password });
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: spacing.lg, boxShadow: elevation.card }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: theme.textPrimary, marginBottom: 14 }}>
        {isEdit ? `Edit ${role}` : `Add ${role}`}
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
          <div>
            <label style={theme.label}>Employee ID</label>
            <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={theme.input} disabled={isEdit} placeholder="e.g. EMP1234" />
          </div>
          <div>
            <label style={theme.label}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={theme.input} />
          </div>
          <div>
            <label style={theme.label}>{isEdit ? 'New password (leave blank to keep)' : 'Password'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={theme.input} />
          </div>
          <div>
            <label style={theme.label}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={theme.input} />
          </div>
          <div>
            <label style={theme.label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={theme.input} />
          </div>
          <div>
            <label style={theme.label}>Plant</label>
            <select value={department || ''} onChange={(e) => setDepartment(e.target.value)} style={theme.input}>
              <option value="" disabled>
                Select a plant
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={theme.label}>Shift name</label>
            <input value={shiftName} onChange={(e) => setShiftName(e.target.value)} style={theme.input} placeholder="e.g. Shift A" />
          </div>
          <div>
            <label style={theme.label}>Shift start</label>
            <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} style={theme.input} />
          </div>
          <div>
            <label style={theme.label}>Shift end</label>
            <input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} style={theme.input} />
          </div>
          {role === 'worker' && (
            <>
              <div>
                <label style={theme.label}>Equipment</label>
                <input value={equipment} onChange={(e) => setEquipment(e.target.value)} style={theme.input} />
              </div>
              <div>
                <label style={theme.label}>Process</label>
                <input value={processField} onChange={(e) => setProcessField(e.target.value)} style={theme.input} />
              </div>
              <div>
                <label style={theme.label}>Incharge</label>
                <select value={incharge} onChange={(e) => setIncharge(e.target.value)} style={theme.input}>
                  <option value="">No incharge</option>
                  {inchargeOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        {error && <div style={theme.errorText}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">
            {isEdit ? 'Save changes' : `Add ${role}`}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function WorkerGroup({ dept, statusFilter, onOpenWorker, onOpenIncharge, onEdit, onDeactivate, onReactivate }) {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ['hr-workforce', 'worker', dept.id, statusFilter, page],
    queryFn: () =>
      getWorkforce({ role: 'worker', department: dept.id, active: activeParamFor(statusFilter), page, limit: GROUP_PAGE_SIZE }),
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  // The departments endpoint's head count is active-only (it's the same
  // number the Dashboard/plant cards use) — correct for this page's default
  // Active view, but wrong once Inactive/All is picked, so those two use
  // this query's own total instead.
  const workerCount = statusFilter === 'active' ? dept.workers ?? 0 : data?.meta?.total ?? 0;
  const workerCountLabel = statusFilter === 'inactive' ? `${workerCount} inactive workers` : `${workerCount} workers`;
  // No cached data yet for this exact page/filter combination — show
  // skeleton rows instead of either blanking to the empty state or leaving
  // the previous page's rows on screen with a stale page number.
  const showSkeleton = isFetching && !data;

  return (
    <div className="ft-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <div style={theme.groupHead}>
        <span style={chipStyle(dept.code)}>{dept.code}</span>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>{dept.name}</span>
        <span style={{ fontSize: 12, color: theme.mutedColor }}>
          {dept.incharges ?? 0} incharges · {workerCountLabel}
        </span>
      </div>
      {!showSkeleton && workerCount === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: theme.mutedColor }}>
          {statusFilter === 'inactive' ? 'No inactive workers in this plant.' : 'No workers in this plant.'}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <Th>Worker</Th>
                <Th>Emp ID</Th>
                <Th>Incharge</Th>
                <Th>Equipment / process</Th>
                <Th>Shift</Th>
                <Th>Notifications</Th>
                <Th></Th>
              </TableHead>
              {showSkeleton ? (
                <SkeletonTableRows columns={7} rows={Math.min(GROUP_PAGE_SIZE, 4)} />
              ) : (
                <tbody key={page} className="ft-fade-in">
                  {pageItems.map((w) => (
                    <TableRow key={w.id}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={w.name} size={30} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <NameLinkButton onClick={() => onOpenWorker(w.id)}>{w.name}</NameLinkButton>
                              {!w.isActive && <Badge tone="neutral">Inactive</Badge>}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span style={{ fontFamily: theme.mono, fontSize: 12.5, color: w.isActive ? theme.textSecondary : theme.mutedColor }}>{w.employeeId}</span>
                      </Td>
                      <Td>
                        {w.incharge ? (
                          <NameLinkButton onClick={() => onOpenIncharge(w.incharge.id)}>{w.incharge.name}</NameLinkButton>
                        ) : (
                          <span style={{ color: theme.mutedColor }}>—</span>
                        )}
                      </Td>
                      <Td>
                        <span style={{ fontSize: 13, color: w.isActive ? theme.textSecondary : theme.mutedColor }}>
                          {w.equipment} · {w.process}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 13, color: w.isActive ? theme.textSecondary : theme.mutedColor }}>
                          {w.shiftName || (w.shiftStart && w.shiftEnd ? `${w.shiftStart}–${w.shiftEnd}` : '—')}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={w.hasNotifications ? 'success' : 'neutral'}>{w.hasNotifications ? 'On' : 'Off'}</Badge>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button variant="secondary" size="sm" onClick={() => onEdit(w)}>
                            Edit
                          </Button>
                          {w.isActive ? (
                            <Button variant="secondary" size="sm" onClick={() => onDeactivate(w)}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="success" size="sm" onClick={() => onReactivate(w)}>
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </Td>
                    </TableRow>
                  ))}
                </tbody>
              )}
            </Table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} disabled={isFetching} />
        </>
      )}
    </div>
  );
}

function InchargeGroup({ dept, statusFilter, onOpenIncharge, onEdit, onDeactivate, onReactivate }) {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ['hr-workforce', 'incharge', dept.id, statusFilter, page],
    queryFn: () =>
      getWorkforce({ role: 'incharge', department: dept.id, active: activeParamFor(statusFilter), page, limit: GROUP_PAGE_SIZE }),
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  const inchargeCount = statusFilter === 'active' ? dept.incharges ?? 0 : data?.meta?.total ?? 0;
  const inchargeCountLabel = statusFilter === 'inactive' ? `${inchargeCount} inactive incharges` : `${inchargeCount} incharges`;
  const showSkeleton = isFetching && !data;

  return (
    <div className="ft-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <div style={theme.groupHead}>
        <span style={chipStyle(dept.code)}>{dept.code}</span>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>{dept.name}</span>
        <span style={{ fontSize: 12, color: theme.mutedColor }}>{inchargeCountLabel}</span>
      </div>
      {!showSkeleton && inchargeCount === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: theme.mutedColor }}>
          {statusFilter === 'inactive' ? 'No inactive incharges in this plant.' : 'No incharges in this plant.'}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <Th>Incharge</Th>
                <Th>Shift</Th>
                <Th>Workers under them</Th>
                <Th></Th>
              </TableHead>
              {showSkeleton ? (
                <SkeletonTableRows columns={4} rows={Math.min(GROUP_PAGE_SIZE, 4)} />
              ) : (
                <tbody key={page} className="ft-fade-in">
                  {pageItems.map((i) => (
                    <TableRow key={i.id}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={i.name} size={30} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <NameLinkButton onClick={() => onOpenIncharge(i.id)}>{i.name}</NameLinkButton>
                            {!i.isActive && <Badge tone="neutral">Inactive</Badge>}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 13, color: i.isActive ? theme.textSecondary : theme.mutedColor }}>
                          {i.shiftName ? `${i.shiftName} · ${i.shiftStart}–${i.shiftEnd}` : `${i.shiftStart}–${i.shiftEnd}`}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone="info">{i.reportCount ?? 0} workers</Badge>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button variant="secondary" size="sm" onClick={() => onEdit(i)}>
                            Edit
                          </Button>
                          {i.isActive ? (
                            <Button variant="secondary" size="sm" onClick={() => onDeactivate(i)}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="success" size="sm" onClick={() => onReactivate(i)}>
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </Td>
                    </TableRow>
                  ))}
                </tbody>
              )}
            </Table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} disabled={isFetching} />
        </>
      )}
    </div>
  );
}
