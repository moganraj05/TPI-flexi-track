import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { changePassword } from '../api/hr';
import { theme } from '../theme';

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

      <button onClick={handleLogout} style={theme.dangerBtn}>
        Log out
      </button>
    </>
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
