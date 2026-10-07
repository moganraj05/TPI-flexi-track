import { useState } from 'react';
import { theme, SUCCESS, WARNING, WARNING_SOFT } from '../../theme';
import { Button } from './Button';

const formatUntil = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

// Shows a freshly generated temporary password exactly once (new account or
// reset) — the server never returns it again. The person must set their own
// password the first time they sign in with it.
export function TempPasswordNotice({ title, name, employeeId, password, expiresAt, onDone, doneLabel = 'Done' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div role="status" style={{ border: `1px solid ${theme.borderColor}`, borderRadius: 12, padding: 18, background: theme.surface }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: theme.textPrimary }}>{title}</div>
      <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
        {name} <span style={{ fontFamily: theme.mono }}>({employeeId})</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Temporary password
        </div>
        <code
          style={{ fontFamily: theme.mono, fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', background: theme.bg, color: theme.textPrimary, padding: '6px 14px', borderRadius: 8, userSelect: 'all' }}
          aria-label={`Temporary password ${password.split('').join(' ')}`}
        >
          {password}
        </code>
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
      </div>

      <div style={{ background: WARNING_SOFT, color: WARNING, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, marginTop: 14 }}>
        <b>Shown only now.</b> Give it to {name.split(' ')[0]} in person or by phone. It works until{' '}
        <b>{formatUntil(expiresAt)}</b>, and they must set their own password the first time they sign in.
      </div>

      {onDone && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <Button onClick={onDone}>{doneLabel}</Button>
          {copied && <span style={{ fontSize: 12.5, color: SUCCESS, fontWeight: 700 }}>Copied to clipboard</span>}
        </div>
      )}
    </div>
  );
}
