import { useState } from 'react';
import { theme, SUCCESS } from '../../theme';
import { PasswordInput } from '../common/PasswordInput';

// Mirrors the backend's strongPassword() rule in validation/schemas.js —
// the server is the one that enforces it; this is only live feedback.
const RULES = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'At least one letter', test: (v) => /[A-Za-z]/.test(v) },
  { label: 'At least one number', test: (v) => /\d/.test(v) },
];

const isStrongPassword = (v) => RULES.every((r) => r.test(v)) && v.length <= 72;

// Set-password step shared by registration and forgot password.
// `onSubmit({ password, confirmPassword })` should throw an Error with a
// user-facing message on failure.
export function PasswordStep({ submitLabel, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isStrongPassword(password)) {
      setError('Password does not meet the requirements below');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and confirm password do not match');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ password, confirmPassword });
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setBusy(false);
    }
  };

  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;

  return (
    <form onSubmit={submit}>
      <label style={theme.label} htmlFor="new-password">
        Password
      </label>
      <PasswordInput
        id="new-password"
        visible={show}
        onToggle={() => setShow((v) => !v)}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        autoFocus
        maxLength={72}
        style={theme.input}
        className="ft-login-input"
      />

      <label style={theme.label} htmlFor="confirm-password">
        Confirm password
      </label>
      <PasswordInput
        id="confirm-password"
        visible={show}
        onToggle={() => setShow((v) => !v)}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        maxLength={72}
        style={{ ...theme.input, ...(mismatch ? { borderColor: theme.errorText.color } : null) }}
        className="ft-login-input"
      />


      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', fontSize: 12.5 }}>
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.label} style={{ color: ok ? SUCCESS : theme.mutedColor, marginBottom: 3 }}>
              {ok ? '✓' : '○'} {rule.label}
            </li>
          );
        })}
        <li style={{ color: confirmPassword && !mismatch ? SUCCESS : theme.mutedColor }}>
          {confirmPassword && !mismatch ? '✓' : '○'} Passwords match
        </li>
      </ul>

      {error && <div style={theme.errorText}>{error}</div>}

      <button type="submit" disabled={busy} className="ft-btn" style={{ ...theme.primaryBtn, opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Please wait…' : submitLabel}
      </button>
    </form>
  );
}
