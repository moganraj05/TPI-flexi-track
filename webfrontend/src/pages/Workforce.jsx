import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDepartments, getWorkforce, createTeamMember, updateTeamMember, deactivateTeamMember } from '../api/hr';
import { theme, chipStyle, filterBtnStyle, SUCCESS } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { plantFilterOptions } from '../components/common/FilterChips';
import { PlantSelect } from '../components/common/PlantSelect';
import { NameLinkButton } from '../components/common/NameLinkButton';
import { Pagination } from '../components/common/Pagination';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useToast } from '../context/ToastContext';

const GROUP_PAGE_SIZE = 8;

export function Workforce() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState('workers');
  const [plantFilter, setPlantFilter] = useState(() => searchParams.get('plant') || 'all');
  const [formTarget, setFormTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

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
    // Team create/update/deactivate doesn't emit a Socket.IO event (only
    // poll activity does), so without this a worker/incharge detail page
    // already cached from earlier in the session would keep showing
    // pre-edit data if opened right after an edit made here.
    queryClient.invalidateQueries({ queryKey: ['hr-employee'] });
  };

  const confirmDeactivate = async () => {
    const member = deactivateTarget;
    const label = member.role === 'worker' ? 'Worker' : 'Incharge';
    await deactivateTeamMember(member.id);
    toast(`${label} deactivated`);
    setDeactivateTarget(null);
    refresh();
  };

  const relevantDepartments = (departments || []).filter((d) => plantFilter === 'all' || d.id === plantFilter);
  const defaultDeptId = plantFilter !== 'all' ? plantFilter : departments?.[0]?.id;

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
        <PlantSelect options={plantFilterOptions(departments)} value={plantFilter} onChange={setPlantFilter} />
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setFormTarget({ mode: 'add', role: 'worker', department: defaultDeptId })}
          style={theme.primaryBtnInline}
        >
          + Add worker
        </button>
        <button
          onClick={() => setFormTarget({ mode: 'add', role: 'incharge', department: defaultDeptId })}
          style={theme.ghostBtn}
        >
          + Add incharge
        </button>
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
          message={`${deactivateTarget.name} will no longer be able to log in or appear in active lists. This can be reversed later by an admin, but treat it as permanent for now.`}
          confirmWord={deactivateTarget.name}
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {relevantDepartments.length === 0 ? (
        <EmptyState title="No plants found" />
      ) : view === 'workers' ? (
        relevantDepartments.map((dept) => (
          <WorkerGroup
            key={dept.id}
            dept={dept}
            onOpenWorker={(id) => navigate(`/app/workforce/worker/${id}`)}
            onOpenIncharge={(id) => navigate(`/app/workforce/incharge/${id}`)}
            onEdit={(member) => setFormTarget({ mode: 'edit', member })}
            onDeactivate={setDeactivateTarget}
          />
        ))
      ) : (
        relevantDepartments.map((dept) => (
          <InchargeGroup
            key={dept.id}
            dept={dept}
            onOpenIncharge={(id) => navigate(`/app/workforce/incharge/${id}`)}
            onEdit={(member) => setFormTarget({ mode: 'edit', member })}
            onDeactivate={setDeactivateTarget}
          />
        ))
      )}
    </>
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
    <div style={theme.card}>
      <div style={{ fontWeight: 700, fontSize: 16, color: theme.textPrimary, marginBottom: 14 }}>
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
          <button type="submit" disabled={saving} style={{ ...theme.primaryBtnInline, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${role}`}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} style={theme.ghostBtn}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function WorkerGroup({ dept, onOpenWorker, onOpenIncharge, onEdit, onDeactivate }) {
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ['hr-workforce', 'worker', dept.id, page],
    queryFn: () => getWorkforce({ role: 'worker', department: dept.id, page, limit: GROUP_PAGE_SIZE }),
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  // Head counts come from the departments endpoint, which aggregates them
  // in the database — no need to hold the workforce here to count it.
  const workerCount = dept.workers ?? 0;

  return (
    <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
      <div style={theme.groupHead}>
        <span style={chipStyle(dept.code)}>{dept.code}</span>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>{dept.name}</span>
        <span style={{ fontSize: 12, color: theme.mutedColor }}>
          {dept.incharges ?? 0} incharges · {workerCount} workers
        </span>
      </div>
      {workerCount === 0 ? (
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
                <th style={theme.th}></th>
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
                  <td style={{ ...theme.td, display: 'flex', gap: 6 }}>
                    <button onClick={() => onEdit(w)} style={theme.ghostBtn}>
                      Edit
                    </button>
                    <button onClick={() => onDeactivate(w)} style={theme.ghostBtn}>
                      Deactivate
                    </button>
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

function InchargeGroup({ dept, onOpenIncharge, onEdit, onDeactivate }) {
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ['hr-workforce', 'incharge', dept.id, page],
    queryFn: () => getWorkforce({ role: 'incharge', department: dept.id, page, limit: GROUP_PAGE_SIZE }),
  });

  const pageItems = data?.items || [];
  const pageCount = data?.meta?.pageCount || 1;
  const inchargeCount = dept.incharges ?? 0;

  return (
    <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
      <div style={theme.groupHead}>
        <span style={chipStyle(dept.code)}>{dept.code}</span>
        <span style={{ fontWeight: 700, color: theme.textPrimary }}>{dept.name}</span>
        <span style={{ fontSize: 12, color: theme.mutedColor }}>{inchargeCount} incharges</span>
      </div>
      {inchargeCount === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: theme.textSecondary }}>No incharges in this plant.</div>
      ) : (
        <>
          <table style={theme.table}>
            <thead>
              <tr style={theme.tableHeadRow}>
                <th style={theme.th}>Incharge</th>
                <th style={theme.th}>Shift</th>
                <th style={theme.th}>Workers under them</th>
                <th style={theme.th}></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i) => (
                <tr key={i.id} style={theme.tr}>
                  <td style={theme.td}>
                    <NameLinkButton onClick={() => onOpenIncharge(i.id)}>{i.name}</NameLinkButton>
                  </td>
                  <td style={theme.td}>{i.shiftName ? `${i.shiftName} · ${i.shiftStart}–${i.shiftEnd}` : `${i.shiftStart}–${i.shiftEnd}`}</td>
                  <td style={theme.td}>{i.reportCount ?? 0} workers</td>
                  <td style={{ ...theme.td, display: 'flex', gap: 6 }}>
                    <button onClick={() => onEdit(i)} style={theme.ghostBtn}>
                      Edit
                    </button>
                    <button onClick={() => onDeactivate(i)} style={theme.ghostBtn}>
                      Deactivate
                    </button>
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
