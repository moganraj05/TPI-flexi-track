import { useState } from 'react';
import { theme } from '../../theme';
import { Dialog } from './Dialog';

// A confirmation dialog styled to match the app. Destructive/irreversible
// actions (deactivating someone, a plant, an HR login) pass `confirmWord` to
// require typing it back — a plain click is too easy to fire by accident for
// something that can't be undone from the UI. Reversible actions (e.g.
// marking attendance, which a worker's own later response just overwrites)
// omit it and get a plain Cancel/Confirm — typing a name every time for
// something HR may do dozens of times a shift would be friction with no
// safety benefit, since there's nothing here that can't be corrected again.
export function ConfirmDialog({ title, message, confirmWord, confirmLabel = 'Deactivate', onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requiresTyping = !!confirmWord;
  const matches = !requiresTyping || (typed.trim().length > 0 && typed.trim().toLowerCase() === confirmWord.trim().toLowerCase());

  const handleConfirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <Dialog onClose={onCancel} disableOverlayClose={busy}>
      <div style={theme.modalIconRing}>!</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: theme.textPrimary, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 1.55, marginBottom: 18 }}>{message}</div>

      {requiresTyping && (
        <>
          <label style={theme.label}>
            Type <strong style={{ color: theme.textPrimary }}>{confirmWord}</strong> to confirm
          </label>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            style={theme.input}
            placeholder={confirmWord}
            disabled={busy}
          />
        </>
      )}

      {error && <div style={theme.errorText}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={onCancel} disabled={busy} className="ft-btn ft-btn-secondary" style={theme.ghostBtn}>
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!matches || busy}
          className={requiresTyping ? 'ft-btn ft-btn-danger' : 'ft-btn ft-btn-primary'}
          style={
            requiresTyping
              ? { ...theme.dangerBtnFilled, opacity: matches && !busy ? 1 : 0.4, cursor: matches && !busy ? 'pointer' : 'not-allowed' }
              : { ...theme.primaryBtnInline, opacity: busy ? 0.7 : 1, cursor: busy ? 'not-allowed' : 'pointer' }
          }
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
