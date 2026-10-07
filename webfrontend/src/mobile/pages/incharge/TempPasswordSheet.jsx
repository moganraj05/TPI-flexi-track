import { useState } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';

const until = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

// A temporary password, shown once — after adding a worker, or approving a
// password reset request (pass a `title`).
export function TempPasswordSheet({ login, onClose, title }) {
  const [copied, setCopied] = useState(false);
  if (!login) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(login.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <BottomSheet open={!!login} onClose={onClose} labelledBy="temp-password-title" dismissable={false}>
      <span className="m-sheet-icon m-tint-go">
        <Icon name="check" size={26} strokeWidth={2.6} />
      </span>
      <h2 id="temp-password-title" className="m-sheet-title">
        {title || `${login.name} added`}
      </h2>
      <p className="m-sheet-body">
        Their sign-in is Employee ID <b className="m-mono">{login.employeeId}</b> with this temporary password:
      </p>

      {login.temporaryPassword ? (
        <div className="m-temp-password">
          <span className="m-mono" aria-label={`Temporary password ${login.temporaryPassword.split('').join(' ')}`}>
            {login.temporaryPassword}
          </span>
          <Button variant="field" className="m-btn-sm" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy'}
          </Button>
        </div>
      ) : null}

      <p className="m-temp-note">
        <b>Shown only now.</b> Tell them in person or by phone. It works until {until(login.temporaryPasswordExpiresAt)}, and they
        choose their own password the first time they sign in with it.
      </p>

      <div className="m-sheet-actions">
        <Button variant="brand" onClick={onClose}>
          Done
        </Button>
      </div>
    </BottomSheet>
  );
}
