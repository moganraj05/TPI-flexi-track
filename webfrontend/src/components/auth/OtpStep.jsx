import { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { authLinkStyle } from './authStyles';

// Enter-the-code step shared by registration and forgot password. The code
// is typed on this page — nothing to click in the email, no redirect.
// `onVerify(code)` and `onResend()` should throw an Error with a
// user-facing message on failure.
export function OtpStep({ email, expiresInMinutes, resendAfterSeconds, onVerify, onResend, onChangeEmail }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(resendAfterSeconds || 60);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email');
      return;
    }
    setBusy(true);
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message || 'Could not verify the code');
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const result = await onResend();
      setCode('');
      setCooldown(result?.resendAfterSeconds || 60);
      setInfo('A new code has been sent. Earlier codes no longer work.');
    } catch (err) {
      setError(err.message || 'Could not resend the code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5, marginTop: 4 }}>
        We sent a 6-digit code to <b style={{ color: theme.textPrimary }}>{email}</b>. It expires in {expiresInMinutes || 10} minutes.
        Check your spam folder if it hasn't arrived.
      </div>

      <label style={theme.label} htmlFor="otp-code">
        Verification code
      </label>
      <input
        id="otp-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="••••••"
        style={{ ...theme.input, fontSize: 22, letterSpacing: '0.5em', textAlign: 'center', fontWeight: 700 }}
        className="ft-login-input"
      />

      {error && <div style={theme.errorText}>{error}</div>}
      {info && <div style={{ ...theme.errorText, color: theme.textSecondary }}>{info}</div>}

      <button type="submit" disabled={busy} className="ft-btn" style={{ ...theme.primaryBtn, opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Please wait…' : 'Verify code'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13 }}>
        <button type="button" onClick={onChangeEmail} disabled={busy} style={authLinkStyle}>
          ← Change details
        </button>
        {cooldown > 0 ? (
          <span style={{ color: theme.mutedColor }}>Resend in {cooldown}s</span>
        ) : (
          <button type="button" onClick={resend} disabled={busy} style={authLinkStyle}>
            Resend code
          </button>
        )}
      </div>
    </form>
  );
}
