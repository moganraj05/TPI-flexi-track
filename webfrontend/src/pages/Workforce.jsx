import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDepartments,
  getWorkforce,
  createTeamMember,
  updateTeamMember,
  deactivateTeamMember,
  downloadTeamBulkTemplate,
  importTeamBulk,
  bulkTeamAction,
  resetTeamMemberPassword,
} from '../api/hr';
import { getShiftCatalog } from '../api/shifts';
import { theme, chipStyle, SUCCESS, WARNING, WARNING_SOFT } from '../theme';
import { spacing, radius, elevation } from '../tokens';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FilterChips, plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { ShiftSelect } from '../components/common/ShiftSelect';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Table, TableHead, Th, TableRow, Td } from '../components/common/Table';
import { SkeletonTableRows } from '../components/common/Skeleton';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { memberShiftLabel } from '../utils/format';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { TempPasswordNotice } from '../components/common/TempPasswordNotice';

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
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  // Admin multi-select: id -> member, across plants and pages of the current
  // view. Cleared whenever the view / status / plant filter changes.
  const [selected, setSelected] = useState(() => new Map());
  const [bulkConfirm, setBulkConfirm] = useState(null); // { action, members }
  const [bulkResult, setBulkResult] = useState(null); // { message, skipped }

  // Plant list + head counts change only on explicit plant/team CRUD, all
  // of which already call invalidateQueries(['hr-departments']) — so a long
  // staleTime here only cuts redundant refetches, it never risks staleness.
  const { data: departments, isPending: departmentsLoading } = useQuery({
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

  function clearSelection() {
    setSelected(new Map());
  }

  const toggleSelect = (member, checked) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(member.id, member);
      else next.delete(member.id);
      return next;
    });

  const togglePage = (members, checked) =>
    setSelected((prev) => {
      const next = new Map(prev);
      members.forEach((m) => (checked ? next.set(m.id, m) : next.delete(m.id)));
      return next;
    });

  // Throws on failure so ConfirmDialog shows the error inline.
  const runBulk = async () => {
    const { action, members } = bulkConfirm;
    const result = await bulkTeamAction(action, members.map((m) => m.id));
    toast(result.message, result.skipped.length ? 'info' : 'success');
    setBulkResult(result.skipped.length ? { message: result.message, skipped: result.skipped } : null);
    setBulkConfirm(null);
    clearSelection();
    refresh();
  };

  const selectedMembers = [...selected.values()];
  const selectedActive = selectedMembers.filter((m) => m.isActive).length;
  const selectedInactive = selectedMembers.length - selectedActive;
  const selectionProps = isAdmin ? { selected, onToggle: toggleSelect, onTogglePage: togglePage } : {};

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
        <FilterChips options={VIEW_OPTIONS} value={view} onChange={(v) => { setView(v); clearSelection(); }} />
        <div className="ft-hide-phone" style={{ width: 1, alignSelf: 'stretch', background: theme.borderColor }} />
        <FilterChips options={STATUS_OPTIONS} value={statusFilter} onChange={(v) => { setStatusFilter(v); clearSelection(); }} />
        <div className="ft-hide-phone" style={{ width: 1, alignSelf: 'stretch', background: theme.borderColor }} />
        <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={(v) => { setPlantFilter(v); clearSelection(); }} />
      </div>

      {isAdmin && selectedMembers.length > 0 && (
        <div
          role="region"
          aria-label="Selected people"
          className="ft-fade-in"
          style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: theme.textPrimary, color: theme.surface, borderRadius: radius.lg, padding: '10px 14px', boxShadow: elevation.raised }}
        >
          <span style={{ fontWeight: 800, fontSize: 13.5, marginRight: 4 }}>
            {selectedMembers.length} selected
          </span>
          {selectedActive > 0 && (
            <Button size="sm" variant="secondary" style={{ background: theme.surface }} onClick={() => setBulkConfirm({ action: 'deactivate', members: selectedMembers.filter((m) => m.isActive) })}>
              Deactivate{selectedInactive ? ` (${selectedActive})` : ''}
            </Button>
          )}
          {selectedInactive > 0 && (
            <Button size="sm" variant="success" style={{ background: theme.surface }} onClick={() => setBulkConfirm({ action: 'reactivate', members: selectedMembers.filter((m) => !m.isActive) })}>
              Reactivate{selectedActive ? ` (${selectedInactive})` : ''}
            </Button>
          )}
          {selectedActive > 0 && (
            <Button size="sm" variant="secondary" style={{ background: theme.surface }} onClick={() => setBulkConfirm({ action: 'require_password_change', members: selectedMembers.filter((m) => m.isActive) })}>
              Require new password
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => setBulkConfirm({ action: 'delete', members: selectedMembers })}>
            Delete permanently
          </Button>
          <button type="button" onClick={clearSelection} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: theme.surface, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>
            Clear selection
          </button>
        </div>
      )}

      {bulkResult && (
        <div style={{ ...theme.card, borderColor: theme.borderColor, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 800, color: theme.textPrimary, marginBottom: 6 }}>{bulkResult.message}</div>
            <div style={{ color: theme.textSecondary, marginBottom: 4 }}>Not changed:</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: theme.textPrimary, lineHeight: 1.6 }}>
              {bulkResult.skipped.map((s) => (
                <li key={s.id}>
                  <b>{s.name ? `${s.name}${s.employeeId ? ` (${s.employeeId})` : ''}` : 'Unknown'}</b> — {s.reason}
                </li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setBulkResult(null)} style={theme.ghostBtn}>
            Dismiss
          </button>
        </div>
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title={
            bulkConfirm.action === 'require_password_change'
              ? `Require ${bulkConfirm.members.length === 1 ? bulkConfirm.members[0].name : `${bulkConfirm.members.length} people`} to set a new password?`
              : bulkConfirm.action === 'delete'
              ? `Delete ${bulkConfirm.members.length === 1 ? bulkConfirm.members[0].name : `${bulkConfirm.members.length} people`} permanently?`
              : `${bulkConfirm.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${bulkConfirm.members.length === 1 ? bulkConfirm.members[0].name : `${bulkConfirm.members.length} people`}?`
          }
          message={
            bulkConfirm.action === 'require_password_change'
              ? 'At their next sign-in they use their current password once, then must choose a new one before doing anything else. Useful when people still use a shared default password.'
              : bulkConfirm.action === 'delete'
              ? 'They are removed from FlexiTrack together with their poll answers and follow-ups, so past reports will no longer include them. This cannot be undone. To keep their history, deactivate instead. The audit log keeps a record of who was deleted.'
              : bulkConfirm.action === 'deactivate'
                ? 'They will no longer be able to sign in or get polls. You can reactivate them later from the Inactive filter. Incharges who still have active workers are skipped unless those workers are selected too.'
                : 'They will be able to sign in again and will appear in active lists, dashboards and live polls.'
          }
          confirmWord={bulkConfirm.action === 'delete' ? 'DELETE' : bulkConfirm.action === 'deactivate' && bulkConfirm.members.length > 1 ? 'DEACTIVATE' : undefined}
          confirmLabel={
            bulkConfirm.action === 'delete'
              ? 'Delete permanently'
              : bulkConfirm.action === 'require_password_change'
                ? 'Require new password'
                : bulkConfirm.action === 'deactivate'
                  ? 'Deactivate'
                  : 'Reactivate'
          }
          onConfirm={runBulk}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

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
            onOpenWorker={(id) => navigate(`/staff/app/workforce/worker/${id}`)}
            onOpenIncharge={(id) => navigate(`/staff/app/workforce/incharge/${id}`)}
            onEdit={(member) => setFormTarget({ mode: 'edit', member })}
            onDeactivate={setDeactivateTarget}
            onReactivate={setReactivateTarget}
            onDelete={isAdmin ? (member) => setBulkConfirm({ action: 'delete', members: [member] }) : null}
            {...selectionProps}
          />
        ))
      ) : (
        relevantDepartments.map((dept) => (
          <InchargeGroup
            key={`${dept.id}-${statusFilter}`}
            dept={dept}
            statusFilter={statusFilter}
            onOpenIncharge={(id) => navigate(`/staff/app/workforce/incharge/${id}`)}
            onEdit={(member) => setFormTarget({ mode: 'edit', member })}
            onDeactivate={setDeactivateTarget}
            onReactivate={setReactivateTarget}
            onDelete={isAdmin ? (member) => setBulkConfirm({ action: 'delete', members: [member] }) : null}
            {...selectionProps}
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
        <div className="ft-page-title" style={{ fontSize: 26, fontWeight: 800, color: theme.textPrimary, letterSpacing: '-0.01em' }}>Workforce</div>
        <div style={{ fontSize: 13.5, color: theme.textSecondary, marginTop: 6, fontWeight: 500 }}>
          Manage workers and incharges across every plant · {plantCount} plant{plantCount === 1 ? '' : 's'} ·{' '}
          {activeWorkerTotal} active workers · {activeInchargeTotal} active incharges
        </div>
      </div>
      <div className="ft-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
    <div className="ft-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: spacing.base }}>
      {items.map((item) => (
        <div
          key={item.key}
          className="ft-card-hover ft-kpi-card"
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
            className="ft-fade-in ft-kpi-value"
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
  const canBulkUpload = !isEdit && role === 'worker';
  const [addMode, setAddMode] = useState('single');

  const [employeeId, setEmployeeId] = useState(isEdit ? member.employeeId : '');
  const [name, setName] = useState(isEdit ? member.name : '');
  const [created, setCreated] = useState(null); // new account's one-time temporary password
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [phone, setPhone] = useState(isEdit ? member.phone || '' : '');
  const [email, setEmail] = useState(isEdit ? member.email || '' : '');
  const [department, setDepartment] = useState(isEdit ? member.department?.id : target.department);
  const [equipment, setEquipment] = useState(isEdit ? member.equipment || '' : '');
  const [processField, setProcessField] = useState(isEdit ? member.process || '' : '');
  const [incharge, setIncharge] = useState(isEdit ? member.incharge?.id || '' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: shiftCatalog } = useQuery({
    queryKey: ['shift-catalog'],
    queryFn: getShiftCatalog,
    staleTime: Infinity,
  });
  const [shiftCode, setShiftCode] = useState('');
  // Seed the picker from the member's current shift once the catalog has
  // loaded — can't be a plain useState initializer since the catalog query
  // is still pending on first render.
  useEffect(() => {
    if (!isEdit || !shiftCatalog || shiftCode) return;
    const match = shiftCatalog.find((s) => s.shiftStart === member.shiftStart && s.shiftEnd === member.shiftEnd);
    if (match) setShiftCode(match.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftCatalog]);

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
    if (!shiftCode) return setError('Shift is required');
    if (!isEdit && !employeeId.trim()) return setError('Employee ID is required');

    setSaving(true);
    try {
      const shared = {
        name,
        phone,
        email,
        department,
        shiftCode,
        ...(role === 'worker' ? { equipment, process: processField, incharge: incharge || null } : {}),
      };

      if (isEdit) {
        await updateTeamMember(member.id, shared);
        onSaved();
      } else {
        // Stay open to show the generated temporary password once.
        setCreated(await createTeamMember({ ...shared, employeeId, role }));
      }
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setResetting(true);
    setError('');
    try {
      setResetResult(await resetTeamMemberPassword(member.id));
      setResetConfirm(false);
    } catch (err) {
      setError(err.message || 'Could not reset the password');
    } finally {
      setResetting(false);
    }
  };

  const panelStyle = { background: theme.surface, border: `1px solid ${theme.borderColor}`, borderRadius: radius.lg, padding: spacing.lg, boxShadow: elevation.card };

  if (created) {
    return (
      <div style={panelStyle}>
        <TempPasswordNotice
          title={`${role === 'worker' ? 'Worker' : 'Incharge'} added`}
          name={created.name}
          employeeId={created.employeeId}
          password={created.temporaryPassword}
          expiresAt={created.temporaryPasswordExpiresAt}
          onDone={onSaved}
        />
      </div>
    );
  }

  if (resetResult) {
    return (
      <div style={panelStyle}>
        <TempPasswordNotice
          title="New temporary password"
          name={resetResult.name}
          employeeId={resetResult.employeeId}
          password={resetResult.temporaryPassword}
          expiresAt={resetResult.expiresAt}
          onDone={onSaved}
        />
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: theme.textPrimary }}>
          {isEdit ? `Edit ${role}` : `Add ${role}`}
        </div>
        {canBulkUpload && (
          <FilterChips
            options={[
              { value: 'single', label: 'Single' },
              { value: 'bulk', label: 'Bulk upload' },
            ]}
            value={addMode}
            onChange={setAddMode}
          />
        )}
      </div>
      {canBulkUpload && addMode === 'bulk' ? (
        <BulkUploadForm departments={departments} defaultDepartment={department} onCancel={onCancel} onDone={onSaved} />
      ) : (
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '0 16px' }}>
          <div>
            <label style={theme.label}>Employee ID</label>
            <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={theme.input} disabled={isEdit} placeholder="e.g. EMP1234" />
          </div>
          <div>
            <label style={theme.label}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={theme.input} />
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
            <label style={theme.label}>Shift</label>
            <div>
              <ShiftSelect shifts={shiftCatalog || []} value={shiftCode} onChange={setShiftCode} allowEmpty emptyLabel="Select a shift" />
            </div>
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
        {!isEdit && (
          <div style={{ fontSize: 12.5, color: theme.textSecondary, marginTop: 12, lineHeight: 1.5 }}>
            A temporary password is created automatically and shown once after saving. They set their own password the
            first time they sign in.
          </div>
        )}
        {isEdit && member.isActive && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: theme.bg + '88', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', fontSize: 12.5, color: theme.textSecondary, lineHeight: 1.5 }}>
              <b style={{ color: theme.textPrimary }}>Forgot their password?</b>{' '}
              {resetConfirm
                ? `${member.name}'s current password stops working and they're signed out everywhere. They get a temporary one (valid 24 hours) and set their own at the next sign-in.`
                : 'Give them a new temporary password.'}
              {member.mustChangePassword && !resetConfirm && ' They still haven\'t set their own password.'}
            </div>
            {resetConfirm ? (
              <>
                <Button type="button" size="sm" onClick={resetPassword} loading={resetting} loadingLabel="Resetting…">
                  Confirm reset
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setResetConfirm(false)} disabled={resetting}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={() => setResetConfirm(true)}>
                Reset password
              </Button>
            )}
          </div>
        )}
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
      )}
    </div>
  );
}

// The "Bulk upload" tab of the Add worker panel: download a fillable
// template scoped to the selected plant (real example row + read-only
// incharge/shift-code reference sheets), then upload the filled copy. Every
// row is validated and inserted independently server-side, so a partial
// success (some rows created, some skipped with a reason) is the normal,
// expected outcome here — not an error state.
function BulkUploadForm({ departments, defaultDepartment, onCancel, onDone }) {
  const [department, setDepartment] = useState(defaultDepartment || departments[0]?.id || '');
  const [file, setFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleDownload = async () => {
    if (!department) return setError('Select a plant first');
    setError('');
    setDownloading(true);
    try {
      await downloadTeamBulkTemplate(department);
    } catch (err) {
      setError(err.message || 'Could not download the template');
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!department) return setError('Select a plant first');
    if (!file) return setError('Choose the filled-in Excel file to upload');
    setError('');
    setResult(null);
    setUploading(true);
    try {
      const data = await importTeamBulk({ department, file });
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '0 16px' }}>
        <div>
          <label style={theme.label}>Plant</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} style={theme.input}>
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
      </div>

      <div style={{ marginTop: 16, padding: spacing.base, background: theme.borderColor + '22', borderRadius: radius.md }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: theme.textPrimary, marginBottom: 4 }}>1. Get the template</div>
        <div style={{ fontSize: 12.5, color: theme.textSecondary, marginBottom: 10 }}>
          One example row already filled in, plus this plant's incharges (name + ID) and the fixed shift codes on their
          own reference sheets — so everything needed to fill it out correctly is right there in the file.
        </div>
        <Button type="button" variant="secondary" onClick={handleDownload} loading={downloading} loadingLabel="Preparing…" disabled={!department}>
          Download sample Excel
        </Button>
      </div>

      <form onSubmit={handleUpload}>
        <div style={{ marginTop: 12, padding: spacing.base, background: theme.borderColor + '22', borderRadius: radius.md }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: theme.textPrimary, marginBottom: 4 }}>2. Upload the filled file</div>
          <div style={{ fontSize: 12.5, color: theme.textSecondary, marginBottom: 10 }}>
            Each row is added independently — if a few rows have an issue (duplicate ID, unknown shift code, unrecognized
            incharge), the rest still go through and you'll see exactly which rows to fix.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ ...theme.input, padding: 6 }}
            />
            <Button type="submit" variant="primary" loading={uploading} loadingLabel="Uploading…" disabled={!file}>
              Upload
            </Button>
          </div>
        </div>

        {error && <div style={theme.errorText}>{error}</div>}

        {result && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: theme.textPrimary }}>
              {result.created} worker{result.created === 1 ? '' : 's'} created
              {result.failed > 0 ? `, ${result.failed} row${result.failed === 1 ? '' : 's'} skipped` : ''}
            </div>
            {result.credentials?.length > 0 && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: WARNING_SOFT, color: WARNING, fontSize: 12.5, lineHeight: 1.5 }}>
                <b>Download the new logins now</b> — the temporary passwords are shown only once. Each person sets their own
                password the first time they sign in.
                <div style={{ marginTop: 8 }}>
                  <Button type="button" size="sm" onClick={() => downloadCredentialsCsv(result.credentials)}>
                    Download new logins (.csv)
                  </Button>
                </div>
              </div>
            )}
            {result.errors.length > 0 && (
              <div style={{ marginTop: 8, ...theme.card, padding: 0, overflow: 'hidden' }}>
                <table style={theme.table}>
                  <thead>
                    <tr style={theme.tableHeadRow}>
                      <th style={theme.th}>Row</th>
                      <th style={theme.th}>Employee ID</th>
                      <th style={theme.th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row} style={theme.tr}>
                        <td style={theme.td}>{e.row}</td>
                        <td style={theme.td}>{e.employeeId || '—'}</td>
                        <td style={{ ...theme.td, color: theme.textSecondary }}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={result?.created > 0 ? onDone : onCancel}>
            {result ? 'Done' : 'Cancel'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function WorkerGroup({ dept, statusFilter, onOpenWorker, onOpenIncharge, onEdit, onDeactivate, onReactivate, onDelete, selected, onToggle, onTogglePage }) {
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
  const showSkeleton = !data;

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
                {selected && (
                  <Th style={{ width: 36 }}>
                    <SelectPageBox items={pageItems} selected={selected} onTogglePage={onTogglePage} label="workers" />
                  </Th>
                )}
                <Th>Worker</Th>
                <Th>Emp ID</Th>
                <Th>Incharge</Th>
                <Th>Equipment / process</Th>
                <Th>Shift</Th>
                <Th>Notifications</Th>
                <Th></Th>
              </TableHead>
              {showSkeleton ? (
                <SkeletonTableRows columns={selected ? 8 : 7} rows={Math.min(GROUP_PAGE_SIZE, 4)} />
              ) : (
                <tbody key={page} className="ft-fade-in">
                  {pageItems.map((w) => (
                    <TableRow key={w.id} className={selected?.has(w.id) ? 'ft-row-selected' : undefined}>
                      {selected && (
                        <Td style={{ width: 36 }}>
                          <SelectBox member={w} selected={selected} onToggle={onToggle} />
                        </Td>
                      )}
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={w.name} size={30} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <NameLinkButton onClick={() => onOpenWorker(w.id)}>{w.name}</NameLinkButton>
                              {!w.isActive && <Badge tone="neutral">Inactive</Badge>}
                              {w.isActive && w.mustChangePassword && <Badge tone="warning">Password not set</Badge>}
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
                          {memberShiftLabel(w)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={w.hasNotifications ? 'success' : 'neutral'}>{w.hasNotifications ? 'On' : 'Off'}</Badge>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                          {onDelete && (
                            <Button variant="danger" size="sm" onClick={() => onDelete(w)}>
                              Delete
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

function InchargeGroup({ dept, statusFilter, onOpenIncharge, onEdit, onDeactivate, onReactivate, onDelete, selected, onToggle, onTogglePage }) {
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
  const showSkeleton = !data;

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
                {selected && (
                  <Th style={{ width: 36 }}>
                    <SelectPageBox items={pageItems} selected={selected} onTogglePage={onTogglePage} label="incharges" />
                  </Th>
                )}
                <Th>Incharge</Th>
                <Th>Shift</Th>
                <Th>Workers under them</Th>
                <Th></Th>
              </TableHead>
              {showSkeleton ? (
                <SkeletonTableRows columns={selected ? 5 : 4} rows={Math.min(GROUP_PAGE_SIZE, 4)} />
              ) : (
                <tbody key={page} className="ft-fade-in">
                  {pageItems.map((i) => (
                    <TableRow key={i.id} className={selected?.has(i.id) ? 'ft-row-selected' : undefined}>
                      {selected && (
                        <Td style={{ width: 36 }}>
                          <SelectBox member={i} selected={selected} onToggle={onToggle} />
                        </Td>
                      )}
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={i.name} size={30} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <NameLinkButton onClick={() => onOpenIncharge(i.id)}>{i.name}</NameLinkButton>
                            {!i.isActive && <Badge tone="neutral">Inactive</Badge>}
                            {i.isActive && i.mustChangePassword && <Badge tone="warning">Password not set</Badge>}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 13, color: i.isActive ? theme.textSecondary : theme.mutedColor }}>
                          {memberShiftLabel(i)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone="info">{i.reportCount ?? 0} workers</Badge>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                          {onDelete && (
                            <Button variant="danger" size="sm" onClick={() => onDelete(i)}>
                              Delete
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

const checkboxStyle = { width: 16, height: 16, cursor: 'pointer', accentColor: theme.accent, verticalAlign: 'middle' };

function SelectBox({ member, selected, onToggle }) {
  return (
    <input
      type="checkbox"
      checked={selected.has(member.id)}
      onChange={(e) => onToggle(member, e.target.checked)}
      aria-label={`Select ${member.name}`}
      style={checkboxStyle}
    />
  );
}

// "Select all on this page" — shows a dash when only some are selected.
function SelectPageBox({ items, selected, onTogglePage, label }) {
  const count = items.filter((m) => selected.has(m.id)).length;
  const all = items.length > 0 && count === items.length;
  return (
    <input
      type="checkbox"
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = count > 0 && !all;
      }}
      onChange={() => onTogglePage(items, !all)}
      disabled={items.length === 0}
      aria-label={`Select all ${label} on this page`}
      style={checkboxStyle}
    />
  );
}

// The generated temporary passwords from an Excel import, as a CSV the HR
// person can print or hand out — the only time they're ever available.
function downloadCredentialsCsv(credentials) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ['Employee ID', 'Name', 'Temporary password', 'Valid until'],
    ...credentials.map((c) => [
      c.employeeId,
      c.name,
      c.temporaryPassword || '(password from the uploaded file)',
      new Date(c.expiresAt).toLocaleString('en-IN'),
    ]),
  ];
  const csv = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `FlexiTrack_new_logins_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
