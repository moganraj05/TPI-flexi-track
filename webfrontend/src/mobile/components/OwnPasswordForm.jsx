import { useState } from 'react';
import { Icon } from './Icon';
import { Button, PasswordInput } from './ui';
import { api } from '../api';

// Live checklist mirroring the server's rules (temp-password.service.js) —
// the server is the one that enforces them; this is only guidance.
function rulesFor(password, confirm, user) {
  const pw = password || '';
  const digits = String(user?.phone || '').replace(/\D/g, '');
  return [
    { label: 'At least 8 characters', ok: pw.length >= 8 },
    { label: 'A letter and a number', ok: /[A-Za-z]/.test(pw) && /\d/.test(pw) },
    {
      label: 'Not your Employee ID or phone number',
      ok:
        pw.length > 0 &&
        !(user?.employeeId && pw.toLowerCase().includes(user.employeeId.toLowerCase())) &&
        !(digits.length >= 6 && pw.replace(/\D/g, '').includes(digits.slice(-6))),
    },
    { label: 'Both passwords match', ok: pw.length > 0 && pw === confirm },
  ];
}

// "Set your own password" — used by the forced screen after a temporary
// password (askCurrent = false) and by Profile → Change password
// (askCurrent = true). Calls onDone({ token, user, message }) on success.
export function OwnPasswordForm({ user, askCurrent, submitLabel = 'Save password', onDone, onCancel }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const rules = rulesFor(password, confirm, user);
  const allOk = rules.every((r) => r.ok) && (!askCurrent || current.length > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!allOk) {
      setError(askCurrent && !current ? 'Enter your current password.' : 'Your new password doesn’t meet all the rules below yet.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await api.changeOwnPassword({
        currentPassword: askCurrent ? current : undefined,
        newPassword: password,
        confirmPassword: confirm,
      });
      onDone({ ...result.data, message: result.message });
    } catch (err) {
      setError(err.message || 'Could not save your password');
      setSaving(false);
    }
  };

  return (
    <form className="m-form-stack" onSubmit={submit} noValidate>
      {askCurrent && (
        <PasswordInput
          label="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      )}
      <PasswordInput
        label="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        maxLength={72}
      />
      <PasswordInput
        label="Type it again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        maxLength={72}
        error={confirm.length > 0 && confirm !== password}
      />
      <ul className="m-rules" aria-label="Password rules">
        {rules.map((r) => (
          <li key={r.label} className={r.ok ? 'm-rule-ok' : ''}>
            <Icon name={r.ok ? 'check' : 'info'} size={15} strokeWidth={r.ok ? 2.6 : 2} />
            {r.label}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="m-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="m-sheet-actions">
        {onCancel ? (
          <Button variant="field" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="brand" loading={saving} disabled={!allOk}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
