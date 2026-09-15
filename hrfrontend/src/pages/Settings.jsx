import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../api/hr';
import { Icon } from '../components/common/Icon';
import { initials } from '../utils/format';

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

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
      setMessage('Password updated successfully');
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
    <div>
      <div style={styles.profileCard}>
        <div style={styles.avatar}>{initials(user?.name)}</div>
        <div>
          <p style={styles.name}>{user?.name}</p>
          <p style={styles.meta}>{user?.employeeId}</p>
        </div>
      </div>

      <div style={styles.infoCard}>
        <InfoRow label="Email" value={user?.email || '—'} />
        <InfoRow label="Phone" value={user?.phone || '—'} />
        <InfoRow label="Role" value={user?.role} last />
      </div>

      <h2 style={styles.sectionTitle}>Change password</h2>
      <form onSubmit={handleSubmit} style={styles.card}>
        <Field label="Current password" value={currentPassword} onChange={setCurrentPassword} />
        <Field label="New password" value={newPassword} onChange={setNewPassword} />
        <Field label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} />

        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.success}>{message}</p>}

        <button type="submit" disabled={saving} style={styles.saveBtn}>
          {saving ? 'Saving…' : 'Update Password'}
        </button>
      </form>

      <button onClick={handleLogout} style={styles.logoutBtn}>
        <Icon name="logout" size={18} />
        Log Out
      </button>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label style={styles.label}>
      {label}
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        style={styles.input}
      />
    </label>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <div style={{ ...styles.infoRow, borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

const styles = {
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 16,
    marginBottom: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: 'var(--blue-deep)',
    color: 'var(--white)',
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 800,
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: { margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'Manrope, sans-serif' },
  meta: { margin: '2px 0 0', fontSize: 12, color: 'var(--ink-soft)' },
  infoCard: {
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: '4px 16px',
    marginBottom: 24,
  },
  infoRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0' },
  infoLabel: { fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 },
  infoValue: { fontSize: 13, fontWeight: 700, textTransform: 'capitalize' },
  sectionTitle: { fontSize: 15, margin: '0 0 10px' },
  card: {
    background: 'var(--white)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-card)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginBottom: 20,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--ink-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  input: {
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-control)',
    padding: '12px 14px',
    fontSize: 14,
    minHeight: 44,
  },
  error: { color: 'var(--red)', fontSize: 13, margin: 0, fontWeight: 600 },
  success: { color: 'var(--green)', fontSize: 13, margin: 0, fontWeight: 600 },
  saveBtn: {
    border: 'none',
    background: 'var(--blue)',
    color: 'var(--white)',
    fontWeight: 800,
    fontFamily: 'Manrope, sans-serif',
    borderRadius: 'var(--radius-control)',
    padding: '13px 14px',
    minHeight: 46,
  },
  logoutBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: '1px solid var(--red)',
    background: 'var(--red-tint)',
    color: 'var(--red)',
    fontWeight: 800,
    fontFamily: 'Manrope, sans-serif',
    borderRadius: 'var(--radius-control)',
    padding: '13px 14px',
    minHeight: 46,
  },
};
