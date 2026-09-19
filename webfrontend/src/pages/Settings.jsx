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
} from '../api/hr';
import { theme, chipStyle } from '../theme';
import { CenteredSpinner } from '../components/common/Spinner';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <div style={{ ...theme.card, maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: theme.textPrimary, marginBottom: 14 }}>Profile</div>
        <Row label="Name" value={user?.name} />
        <Row label="Email" value={user?.email} />
        <Row label="Employee ID" value={user?.employeeId} />
        <Row label="Role" value={user?.role} noBorder />
      </div>

      <div style={{ ...theme.card, maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: theme.textPrimary, marginBottom: 14 }}>Change password</div>
        <form onSubmit={handleSubmit}>
          <label style={theme.label}>Current password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={theme.input} required />
          <label style={theme.label}>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={theme.input} required />
          <label style={theme.label}>Confirm new password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={theme.input} required />
          {error && <div style={theme.errorText}>{error}</div>}
          <button type="submit" disabled={saving} style={{ ...theme.primaryBtnInline, marginTop: 16, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      <ManagePlants />

      {user?.role !== 'hr' && <ManageHrAdmins currentUserId={user?.id} />}

      <button onClick={handleLogout} style={theme.dangerBtn}>
        Log out
      </button>
    </>
  );
}

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

  return (
    <div style={{ ...theme.card, maxWidth: 480, padding: 0, overflow: 'hidden' }}>
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
      <div style={{ padding: '16px 16px 0', fontWeight: 700, fontSize: 16, color: theme.textPrimary }}>Manage plants</div>

      {isLoading ? (
        <CenteredSpinner label="Loading plants…" />
      ) : (
        <div style={{ padding: 16 }}>
          {(departments || []).map((dept) => (
            <div key={dept.id} style={{ borderBottom: `1px solid ${theme.borderColor}`, paddingBottom: 12, marginBottom: 12 }}>
              {editingId === dept.id ? (
                <>
                  <label style={theme.label}>Name</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} style={theme.input} />
                  <label style={theme.label}>Code</label>
                  <input value={editCode} onChange={(e) => setEditCode(e.target.value)} style={theme.input} />
                  {formError && <div style={theme.errorText}>{formError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={saveEdit} disabled={busy} style={theme.primaryBtnInline}>
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={busy} style={theme.ghostBtn}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={chipStyle(dept.code)}>{dept.code}</span>
                    <span style={{ fontWeight: 600, color: theme.textPrimary }}>{dept.name}</span>
                    {!dept.isActive && (
                      <span style={{ background: theme.borderColor, color: theme.textSecondary, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startEdit(dept)} disabled={busy} style={theme.ghostBtn}>
                      Edit
                    </button>
                    <button
                      onClick={() => (dept.isActive ? setDeactivateTarget(dept) : reactivate(dept))}
                      disabled={busy}
                      style={theme.ghostBtn}
                    >
                      {dept.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAdd ? (
            <form onSubmit={addPlant}>
              <label style={theme.label}>Plant name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} style={theme.input} placeholder="e.g. Assembly Plant" />
              <label style={theme.label}>Plant code</label>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} style={theme.input} placeholder="e.g. ASSY" />
              {addError && <div style={theme.errorText}>{addError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="submit" disabled={busy} style={theme.primaryBtnInline}>
                  Add plant
                </button>
                <button type="button" onClick={() => setShowAdd(false)} disabled={busy} style={theme.ghostBtn}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowAdd(true)} style={theme.primaryBtnInline}>
              + Add plant
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const HR_ROLE_OPTIONS = ['hr', 'admin', 'superadmin'];

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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hr-admins'] });

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

  return (
    <div style={{ ...theme.card, maxWidth: 480, padding: 0, overflow: 'hidden' }}>
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
      <div style={{ padding: '16px 16px 0', fontWeight: 700, fontSize: 16, color: theme.textPrimary }}>Manage HR logins</div>

      {isLoading ? (
        <CenteredSpinner label="Loading HR logins…" />
      ) : (
        <div style={{ padding: 16 }}>
          {(admins || []).map((admin) => (
            <div key={admin.id} style={{ borderBottom: `1px solid ${theme.borderColor}`, paddingBottom: 12, marginBottom: 12 }}>
              {editingId === admin.id ? (
                <>
                  <label style={theme.label}>Name</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} style={theme.input} />
                  <label style={theme.label}>Phone</label>
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} style={theme.input} />
                  {formError && <div style={theme.errorText}>{formError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={saveEdit} disabled={busy} style={theme.primaryBtnInline}>
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={busy} style={theme.ghostBtn}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: theme.textPrimary }}>{admin.name}</span>
                      <span
                        style={{
                          background: theme.borderColor,
                          color: theme.textSecondary,
                          fontSize: 10.5,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          padding: '2px 7px',
                          borderRadius: 6,
                        }}
                      >
                        {admin.role}
                      </span>
                      {!admin.isActive && (
                        <span style={{ background: theme.borderColor, color: theme.textSecondary, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>
                          Inactive
                        </span>
                      )}
                      {admin.id === currentUserId && (
                        <span style={{ fontSize: 11, color: theme.mutedColor, fontStyle: 'italic' }}>(you)</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: theme.textSecondary }}>
                      {admin.employeeId} · {admin.email}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => startEdit(admin)} disabled={busy} style={theme.ghostBtn}>
                      Edit
                    </button>
                    {admin.id !== currentUserId && (
                      <button
                        onClick={() => (admin.isActive ? setDeactivateTarget(admin) : reactivate(admin))}
                        disabled={busy}
                        style={theme.ghostBtn}
                      >
                        {admin.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {showAdd ? (
            <form onSubmit={addAdmin}>
              <label style={theme.label}>Employee ID</label>
              <input value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)} style={theme.input} placeholder="e.g. HR002" />
              <label style={theme.label}>Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} style={theme.input} />
              <label style={theme.label}>Email</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={theme.input} />
              <label style={theme.label}>Phone</label>
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} style={theme.input} />
              <label style={theme.label}>Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={theme.input} />
              <label style={theme.label}>Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={theme.input}>
                {HR_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {addError && <div style={theme.errorText}>{addError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="submit" disabled={busy} style={theme.primaryBtnInline}>
                  Add HR login
                </button>
                <button type="button" onClick={() => setShowAdd(false)} disabled={busy} style={theme.ghostBtn}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowAdd(true)} style={theme.primaryBtnInline}>
              + Add HR login
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, noBorder }) {
  return (
    <div style={{ ...theme.settingsRow, ...(noBorder ? { borderBottom: 'none' } : null) }}>
      <span style={theme.settingsLabel}>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}
