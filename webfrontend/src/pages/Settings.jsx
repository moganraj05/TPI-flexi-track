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
  resendStaffInvite,
  deleteHrAdmin,
  requirePasswordChange,
} from '../api/hr';
import { theme, chipStyle, WARNING, WARNING_SOFT, DANGER } from '../theme';
import { formatDateTime } from '../utils/format';
import { CenteredSpinner } from '../components/common/Spinner';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { PasswordInput } from '../components/common/PasswordInput';
import { roleTag, isAdminRole, ASSIGNABLE_ROLES } from '../utils/roles';

const roleLabel = roleTag;

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
        <ManagePlants canManage={isAdminRole(user?.role)} />
        {isAdminRole(user?.role) && <ManageHrAdmins currentUserId={user?.id} />}
        {isAdminRole(user?.role) && <WorkerPasswordsCard />}
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
        className="ft-card-head"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
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
      <div className={flush ? undefined : 'ft-card-body'} style={flush ? undefined : { padding: '18px 22px 22px' }}>{children}</div>
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
      className="ft-settings-item ft-list-item"
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
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12 }}>
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
          <PasswordInput className="ft-settings-input" style={inputStyle} autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', columnGap: 12 }}>
          <Field label="New password">
            <PasswordInput className="ft-settings-input" style={inputStyle} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput className="ft-settings-input" style={inputStyle} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
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
    navigate('/staff/login', { replace: true });
  };

  return (
    <section className="ft-card-head" style={{ ...theme.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 22px' }}>
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

// Plants are configuration: admins add/edit/deactivate them; Staff see the list.
function ManagePlants({ canManage }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: departments, isPending: isLoading } = useQuery({
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
      description={canManage ? 'Plants workers and incharges are assigned to.' : 'Plants workers and incharges are assigned to. Only admins can change them.'}
      flush
      action={
        canManage &&
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
                {canManage && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                )}
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
  // Always fresh: the server also pushes a live "staff:update" event (see
  // SocketContext) whenever a login changes — e.g. an invited person sets
  // their password — and the list refetches when the tab is focused again.
  const { data: admins, isPending: isLoading } = useQuery({
    queryKey: ['hr-admins'],
    queryFn: getHrAdmins,
    staleTime: 0,
    refetchOnWindowFocus: true,
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
  const [newRole, setNewRole] = useState('hr');
  const [addError, setAddError] = useState('');

  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
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
      toast('Login updated');
      setEditingId(null);
      refresh();
    } catch (err) {
      setFormError(err.message || 'Could not update login');
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (admin) => {
    setBusy(true);
    try {
      await updateHrAdmin(admin.id, { isActive: true });
      toast('Login reactivated');
      refresh();
    } catch (err) {
      toast(err.message || 'Could not reactivate login');
    } finally {
      setBusy(false);
    }
  };

  // Throws on failure so ConfirmDialog shows the error inline.
  const confirmDelete = async () => {
    const result = await deleteHrAdmin(deleteTarget.id);
    toast(result.message || 'Login deleted', 'success');
    setDeleteTarget(null);
    refresh();
  };

  const confirmDeactivate = async () => {
    await deactivateHrAdmin(deactivateTarget.id);
    toast('Login deactivated');
    setDeactivateTarget(null);
    refresh();
  };

  const addAdmin = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!newEmployeeId.trim() || !newName.trim() || !newEmail.trim()) {
      setAddError('Employee ID, name and email are required');
      return;
    }
    setBusy(true);
    try {
      const result = await createHrAdmin({
        employeeId: newEmployeeId,
        name: newName,
        email: newEmail,
        phone: newPhone,
        role: newRole,
      });
      toast(result.message, result.login.invitationEmailed ? 'success' : 'error');
      setNewEmployeeId('');
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewRole('hr');
      setShowAdd(false);
      refresh();
    } catch (err) {
      setAddError(err.message || 'Could not create the login');
    } finally {
      setBusy(false);
    }
  };

  const resendInvite = async (admin) => {
    setBusy(true);
    try {
      const result = await resendStaffInvite(admin.id);
      toast(result.message || 'Invitation sent', 'success');
      refresh();
    } catch (err) {
      toast(err.message || 'Could not send the invitation', 'error');
    } finally {
      setBusy(false);
    }
  };

  const twoCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', columnGap: 12 };

  return (
    <SettingsCard
      title="Staff & admin logins"
      description="People who can sign in to this console. New logins get an email to set their own password."
      flush
      action={
        !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Add login
          </Button>
        )
      }
    >
      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate login?"
          message={`${deactivateTarget.name} (${deactivateTarget.employeeId}) will no longer be able to sign in to the ops console.`}
          confirmWord={deactivateTarget.name}
          confirmLabel="Deactivate"
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete this login permanently?"
          message={`${deleteTarget.name} (${deleteTarget.email}) will be removed and can no longer sign in. This can't be undone — to keep their name on past actions, deactivate instead. Their earlier actions stay in the audit log.`}
          confirmWord={deleteTarget.name}
          confirmLabel="Delete permanently"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
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
        <FormPanel title="New login" onSubmit={addAdmin}>
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
            <Field label="Role" hint="Admins also manage logins, send notifications and see the audit log.">
              <select className="ft-settings-input" value={newRole} onChange={(e) => setNewRole(e.target.value)} style={selectStyle}>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ fontSize: 12.5, color: theme.textSecondary, lineHeight: 1.5 }}>
            An invitation email goes to this address with a link to set their own password (valid for 72 hours). They can
            sign in after that.
          </div>
          <ErrorText>{addError}</ErrorText>
          <FormActions>
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Send invitation
            </Button>
          </FormActions>
        </FormPanel>
      )}

      {isLoading ? (
        <CenteredSpinner label="Loading HR logins…" />
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ background: WARNING_SOFT, borderRadius: 10, padding: 14, margin: '16px clamp(12px, 4vw, 22px)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: WARNING, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Awaiting approval · {pending.length}
              </div>
              {pending.map((p) => (
                <div key={p.id} style={{ background: theme.surface, borderRadius: 8, padding: 14, marginTop: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Avatar name={p.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: theme.textPrimary }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
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
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
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
            <EmptyNote>No logins yet.</EmptyNote>
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
                          {admin.invitePending && <Badge tone="warning">Invitation pending</Badge>}
                          {!admin.isActive && <Badge>Inactive</Badge>}
                        </div>
                        <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {admin.employeeId} · {admin.email}
                          {admin.department ? ` · ${admin.department.code}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                      {admin.invitePending && admin.isActive && (
                        <Button size="sm" variant="secondary" onClick={() => resendInvite(admin)} disabled={busy} title={admin.invitedAt ? `Last sent ${formatDateTime(admin.invitedAt)}` : undefined}>
                          Resend invitation
                        </Button>
                      )}
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
                      {admin.id !== currentUserId && (
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(admin)} disabled={busy}>
                          Delete
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

// ---------------------------------------------------------------------------
// Worker & incharge passwords (admin)
// ---------------------------------------------------------------------------

// Makes everyone in a plant (or everyone) choose a new password at their next
// sign-in — the fix for accounts still on a shared default password. For one
// or a few people, use the selection in Workforce instead.
function WorkerPasswordsCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: getDepartments, staleTime: 5 * 60 * 1000 });
  const [scope, setScope] = useState('');
  const [confirming, setConfirming] = useState(false);

  const activePlants = (departments || []).filter((d) => d.isActive !== false);
  const chosen = activePlants.find((d) => d.id === scope);
  const scopeLabel = scope === 'all' ? 'everyone in every plant' : chosen ? `everyone in ${chosen.name} (${chosen.code})` : '';

  // Throws on failure so ConfirmDialog shows the error inline.
  const confirm = async () => {
    const result = await requirePasswordChange(scope === 'all' ? { scope: 'all' } : { scope: 'plant', departmentId: scope });
    toast(result.message, result.count ? 'success' : 'info');
    setConfirming(false);
    setScope('');
    queryClient.invalidateQueries({ queryKey: ['hr-workforce'] });
  };

  return (
    <SettingsCard
      title="Worker & incharge passwords"
      description="Make people choose a new password at their next sign-in — for example, when accounts still use a shared default password."
    >
      {confirming && (
        <ConfirmDialog
          title="Require a new password?"
          message={`At their next sign-in, ${scopeLabel} will use their current password once and then must choose a new one before doing anything else. People who already have to set one are not affected.`}
          confirmWord={scope === 'all' ? 'EVERYONE' : undefined}
          confirmLabel="Require new password"
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Who">
          <select className="ft-settings-input" value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...selectStyle, minWidth: 'min(220px, 100%)' }}>
            <option value="" disabled>
              Choose a plant or everyone
            </option>
            {activePlants.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
            <option value="all">Everyone (all plants)</option>
          </select>
        </Field>
        <div style={{ marginBottom: 14 }}>
          <Button onClick={() => setConfirming(true)} disabled={!scope}>
            Require new password
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
        New accounts and password resets already get a one-time temporary password, so this is only needed for existing
        accounts.
      </div>
    </SettingsCard>
  );
}
