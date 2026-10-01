import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  changePassword,
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  getHrAdmins,
  createHrAdmin,
  updateHrAdmin,
  deactivateHrAdmin,
  approveHrRegistration,
  rejectHrRegistration,
} from '../api/hr';
import { theme, chipStyle, WARNING, WARNING_SOFT, DANGER } from '../theme';
import { formatDateTime } from '../utils/format';
import { CenteredSpinner } from '../components/common/Spinner';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';

const HR_ROLE_OPTIONS = ['hr', 'admin', 'superadmin'];
const ROLE_LABELS = { hr: 'HR', admin: 'Admin', superadmin: 'Super admin', incharge: 'Incharge', supervisor: 'Supervisor', worker: 'Worker' };
const roleLabel = (role) => ROLE_LABELS[role] || role || '—';

// White field on the white card (the global theme.input uses the page's
// blue-grey background, which read as heavy filled blocks inside a card).
const inputStyle = { ...theme.input, background: theme.surface, marginBottom: 0 };
const selectStyle = { ...inputStyle, cursor: 'pointer' };

export function Settings() {
  const { user } = useAuth();

  return (
    <div className="ft-settings-grid">
      <div className="ft-settings-col">
        <ProfileCard user={user} />
        <ChangePasswordCard />
        <SessionCard />
      </div>
      <div className="ft-settings-col">
        <ManagePlants />
        {user?.role !== 'hr' && <ManageHrAdmins currentUserId={user?.id} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function SettingsCard({ title, description, action, children, flush = false }) {
  return (
    <section style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '18px 22px',
          borderBottom: `1px solid ${theme.borderColor}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: theme.textPrimary }}>{title}</h2>
          {description && <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: theme.textSecondary }}>{description}</p>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </header>
      <div style={flush ? undefined : { padding: '18px 22px 22px' }}>{children}</div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11.5, color: theme.textSecondary, opacity: 0.85, marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

function TextInput(props) {
  return <input className="ft-settings-input" style={inputStyle} {...props} />;
}

function FormPanel({ title, onSubmit, children }) {
  return (
    <form
      onSubmit={onSubmit}
      style={{ background: theme.bg + '66', border: `1px solid ${theme.borderColor}`, borderRadius: 10, padding: 16, margin: '16px 22px' }}
    >
      {title && <div style={{ fontSize: 13, fontWeight: 800, color: theme.textPrimary, marginBottom: 12 }}>{title}</div>}
      {children}
    </form>
  );
}

function FormActions({ children }) {
  return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>{children}</div>;
}

function ErrorText({ children }) {
  if (!children) return null;
  return <div style={{ ...theme.errorText, marginTop: 0, marginBottom: 12 }}>{children}</div>;
}

function ListItem({ children, last }) {
  return (
    <div
      className="ft-settings-item"
      style={{ padding: '14px 22px', borderBottom: last ? 'none' : `1px solid ${theme.borderColor}66` }}
    >
      {children}
    </div>
  );
}

function EmptyNote({ children }) {
  return <div style={{ padding: '22px', fontSize: 13, color: theme.textSecondary, textAlign: 'center' }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Account column
// ---------------------------------------------------------------------------

function ProfileCard({ user }) {
  return (
    <SettingsCard title="Profile" description="Your account details for the ops console.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Avatar name={user?.name} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: theme.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || '—'}
          </div>
          <div style={{ marginTop: 4 }}>
            <Badge tone="info">{roleLabel(user?.role)}</Badge>
          </div>
        </div>
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Detail label="Employee ID" value={user?.employeeId} mono />
        <Detail label="Email" value={user?.email} />
      </dl>
    </SettingsCard>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div style={{ background: theme.bg + '55', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <dt style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.textSecondary }}>{label}</dt>
      <dd
        style={{
          margin: '4px 0 0',
          fontSize: 13.5,
          fontWeight: 600,
          color: theme.textPrimary,
          fontFamily: mono ? theme.mono : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value || undefined}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Could not update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard title="Change password" description="Use at least 6 characters. You'll stay signed in on this browser.">
      <form onSubmit={handleSubmit}>
        <Field label="Current password">
          <TextInput type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', columnGap: 12 }}>
          <Field label="New password">
            <TextInput type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </Field>
          <Field label="Confirm new password">
            <TextInput type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <FormActions>
          <Button type="submit" loading={saving} loadingLabel="Updating…">
            Update password
          </Button>
        </FormActions>
      </form>
    </SettingsCard>
  );
}

function SessionCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <section style={{ ...theme.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 22px' }}>
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: theme.textPrimary }}>Sign out</div>
        <div style={{ fontSize: 12.5, color: theme.textSecondary, marginTop: 4 }}>End your session on this browser.</div>
      </div>
      <button onClick={handleLogout} className="ft-btn ft-btn-danger-outline" style={{ ...theme.dangerBtn, borderColor: DANGER }}>
        Log out
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Admin column
// ---------------------------------------------------------------------------

function ManagePlants() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: departments, isLoading } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: getDepartments,
    staleTime: 5 * 60 * 1000,
  });

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [addError, setAddError] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hr-departments'] });

  const startEdit = (dept) => {
    setEditingId(dept.id);
    setEditName(dept.name);
    setEditCode(dept.code);
    setFormError('');
  };

  const saveEdit = async () => {
    setFormError('');
    setBusy(true);
    try {
      await updateDepartment(editingId, { name: editName, code: editCode });
      toast('Plant updated');
      setEditingId(null);
      refresh();
    } catch (err) {
      setFormError(err.message || 'Could not update plant');
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (dept) => {
    setBusy(true);
    try {
      await updateDepartment(dept.id, { isActive: true });
      toast('Plant reactivated');
      refresh();
    } catch (err) {
      toast(err.message || 'Could not reactivate plant');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeactivate = async () => {
    await deactivateDepartment(deactivateTarget.id);
    toast('Plant deactivated');
    setDeactivateTarget(null);
    refresh();
  };

  const addPlant = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!newName.trim() || !newCode.trim()) {
      setAddError('Name and code are required');
      return;
    }
    setBusy(true);
    try {
      await createDepartment({ name: newName, code: newCode });
      toast('Plant created');
      setNewName('');
      setNewCode('');
      setShowAdd(false);
      refresh();
    } catch (err) {
      setAddError(err.message || 'Could not create plant');
    } finally {
      setBusy(false);
    }
  };

  const list = departments || [];

  return (
    <SettingsCard
      title="Plants"
      description="Plants workers and incharges are assigned to."
      flush
      action={
        !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Add plant
          </Button>
        )
      }
    >
      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate plant?"
          message={`${deactivateTarget.name} (${deactivateTarget.code}) will be hidden from active views. This is blocked automatically if any workers or incharges are still assigned to it.`}
          confirmWord={deactivateTarget.name}
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {showAdd && (
        <FormPanel title="New plant" onSubmit={addPlant}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', columnGap: 12 }}>
            <Field label="Plant name">
              <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Assembly Plant" autoFocus />
            </Field>
            <Field label="Plant code">
              <TextInput value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. ASSY" />
            </Field>
          </div>
          <ErrorText>{addError}</ErrorText>
          <FormActions>
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Add plant
            </Button>
          </FormActions>
        </FormPanel>
      )}

      {isLoading ? (
        <CenteredSpinner label="Loading plants…" />
      ) : list.length === 0 ? (
        <EmptyNote>No plants yet.</EmptyNote>
      ) : (
        list.map((dept, i) => (
          <ListItem key={dept.id} last={i === list.length - 1}>
            {editingId === dept.id ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', columnGap: 12 }}>
                  <Field label="Name">
                    <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </Field>
                  <Field label="Code">
                    <TextInput value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                  </Field>
                </div>
                <ErrorText>{formError}</ErrorText>
                <FormActions>
                  <Button variant="secondary" onClick={() => setEditingId(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button onClick={saveEdit} disabled={busy}>
                    Save
                  </Button>
                </FormActions>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, opacity: dept.isActive ? 1 : 0.65 }}>
                  <span style={chipStyle(dept.code)}>{dept.code}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: theme.textPrimary }}>{dept.name}</span>
                  {!dept.isActive && <Badge>Inactive</Badge>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" onClick={() => startEdit(dept)} disabled={busy}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={dept.isActive ? 'secondary' : 'success'}
                    onClick={() => (dept.isActive ? setDeactivateTarget(dept) : reactivate(dept))}
                    disabled={busy}
                  >
                    {dept.isActive ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </div>
              </div>
            )}
          </ListItem>
        ))
      )}
    </SettingsCard>
  );
}

function ManageHrAdmins({ currentUserId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  // HR/admin logins change only through this panel's own create/update/
  // deactivate actions, which already invalidate this key on every write.
  const { data: admins, isLoading } = useQuery({
    queryKey: ['hr-admins'],
    queryFn: getHrAdmins,
    staleTime: 5 * 60 * 1000,
  });

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('hr');
  const [addError, setAddError] = useState('');

  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [approveRoles, setApproveRoles] = useState({});

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hr-admins'] });

  const pending = (admins || []).filter((a) => a.approvalStatus === 'pending');
  const accounts = (admins || []).filter((a) => a.approvalStatus !== 'pending');

  const approve = async (admin) => {
    setBusy(true);
    try {
      const result = await approveHrRegistration(admin.id, approveRoles[admin.id] || 'hr');
      toast(result.message || 'Registration approved');
    } catch (err) {
      toast(err.message || 'Could not approve registration');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  // Throws on failure so ConfirmDialog shows the error inline.
  const confirmReject = async () => {
    const result = await rejectHrRegistration(rejectTarget.id);
    toast(result.message || 'Registration rejected');
    setRejectTarget(null);
    refresh();
  };

  const startEdit = (admin) => {
    setEditingId(admin.id);
    setEditName(admin.name);
    setEditPhone(admin.phone || '');
    setFormError('');
  };

  const saveEdit = async () => {
    setFormError('');
    setBusy(true);
    try {
      await updateHrAdmin(editingId, { name: editName, phone: editPhone });
      toast('HR login updated');
      setEditingId(null);
      refresh();
    } catch (err) {
      setFormError(err.message || 'Could not update HR login');
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (admin) => {
    setBusy(true);
    try {
      await updateHrAdmin(admin.id, { isActive: true });
      toast('HR login reactivated');
      refresh();
    } catch (err) {
      toast(err.message || 'Could not reactivate HR login');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeactivate = async () => {
    await deactivateHrAdmin(deactivateTarget.id);
    toast('HR login deactivated');
    setDeactivateTarget(null);
    refresh();
  };

  const addAdmin = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!newEmployeeId.trim() || !newName.trim() || !newEmail.trim() || !newPassword) {
      setAddError('Employee ID, name, email and password are required');
      return;
    }
    if (newPassword.length < 6) {
      setAddError('Password must be at least 6 characters');
      return;
    }
    setBusy(true);
    try {
      await createHrAdmin({
        employeeId: newEmployeeId,
        name: newName,
        email: newEmail,
        phone: newPhone,
        password: newPassword,
        role: newRole,
      });
      toast('HR login created');
      setNewEmployeeId('');
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      setNewRole('hr');
      setShowAdd(false);
      refresh();
    } catch (err) {
      setAddError(err.message || 'Could not create HR login');
    } finally {
      setBusy(false);
    }
  };

  const twoCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', columnGap: 12 };

  return (
    <SettingsCard
      title="HR logins"
      description="People who can sign in to this ops console."
      flush
      action={
        !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Add HR login
          </Button>
        )
      }
    >
      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate HR login?"
          message={`${deactivateTarget.name} (${deactivateTarget.employeeId}) will no longer be able to sign in to the ops console.`}
          confirmWord={deactivateTarget.name}
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
      {rejectTarget && (
        <ConfirmDialog
          title="Reject registration?"
          message={`${rejectTarget.name} (${rejectTarget.email}) will be removed and notified by email. They can register again later if needed.`}
          confirmLabel="Reject"
          onConfirm={confirmReject}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {showAdd && (
        <FormPanel title="New HR login" onSubmit={addAdmin}>
          <div style={twoCol}>
            <Field label="Employee ID">
              <TextInput value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)} placeholder="e.g. HR002" autoFocus />
            </Field>
            <Field label="Name">
              <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </Field>
            <Field label="Phone">
              <TextInput value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </Field>
            <Field label="Password" hint="At least 6 characters">
              <TextInput type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Role">
              <select className="ft-settings-input" value={newRole} onChange={(e) => setNewRole(e.target.value)} style={selectStyle}>
                {HR_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <ErrorText>{addError}</ErrorText>
          <FormActions>
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Add HR login
            </Button>
          </FormActions>
        </FormPanel>
      )}

      {isLoading ? (
        <CenteredSpinner label="Loading HR logins…" />
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ background: WARNING_SOFT, borderRadius: 10, padding: 14, margin: '16px 22px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: WARNING, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Awaiting approval · {pending.length}
              </div>
              {pending.map((p) => (
                <div key={p.id} style={{ background: theme.surface, borderRadius: 8, padding: 14, marginTop: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Avatar name={p.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: theme.textPrimary }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2, lineHeight: 1.6 }}>
                      {p.employeeId} · {p.email}
                      <br />
                      {p.phone || 'No phone'} · {p.department ? `${p.department.name} (${p.department.code})` : 'No plant'}
                      {p.createdAt && (
                        <>
                          <br />
                          Registered {formatDateTime(p.createdAt)}
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="ft-settings-input"
                        value={approveRoles[p.id] || 'hr'}
                        onChange={(e) => setApproveRoles((r) => ({ ...r, [p.id]: e.target.value }))}
                        disabled={busy}
                        aria-label={`Role for ${p.name}`}
                        style={{ ...selectStyle, width: 'auto', padding: '6px 10px', fontSize: 12.5 }}
                      >
                        {HR_ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" variant="success" onClick={() => approve(p)} disabled={busy}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRejectTarget(p)} disabled={busy}>
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {accounts.length === 0 ? (
            <EmptyNote>No HR logins yet.</EmptyNote>
          ) : (
            accounts.map((admin, i) => (
              <ListItem key={admin.id} last={i === accounts.length - 1}>
                {editingId === admin.id ? (
                  <>
                    <div style={twoCol}>
                      <Field label="Name">
                        <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </Field>
                      <Field label="Phone">
                        <TextInput value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                      </Field>
                    </div>
                    <ErrorText>{formError}</ErrorText>
                    <FormActions>
                      <Button variant="secondary" onClick={() => setEditingId(null)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button onClick={saveEdit} disabled={busy}>
                        Save
                      </Button>
                    </FormActions>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 240px', opacity: admin.isActive ? 1 : 0.65 }}>
                      <Avatar name={admin.name} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: theme.textPrimary }}>{admin.name}</span>
                          {admin.id === currentUserId && <span style={{ fontSize: 11.5, color: theme.textSecondary }}>(you)</span>}
                          <Badge tone="info">{roleLabel(admin.role)}</Badge>
                          {!admin.isActive && <Badge>Inactive</Badge>}
                        </div>
                        <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {admin.employeeId} · {admin.email}
                          {admin.department ? ` · ${admin.department.code}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <Button size="sm" variant="secondary" onClick={() => startEdit(admin)} disabled={busy}>
                        Edit
                      </Button>
                      {admin.id !== currentUserId && (
                        <Button
                          size="sm"
                          variant={admin.isActive ? 'secondary' : 'success'}
                          onClick={() => (admin.isActive ? setDeactivateTarget(admin) : reactivate(admin))}
                          disabled={busy}
                        >
                          {admin.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </ListItem>
            ))
          )}
        </>
      )}
    </SettingsCard>
  );
}
