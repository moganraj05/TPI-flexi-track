import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, TextField } from '../components/ui';
import { api } from '../api';

// "Forgot password?" for workers and incharges. There's no email/SMS: the
// request goes to their incharge (or the plant's supervisor), who calls them
// to confirm it's really them and gives them a temporary password.
export function ForgotPasswordPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!employeeId.trim()) return setError('Enter your Employee ID.');
    if (!/^\d{4}$/.test(phoneLast4)) return setError('Enter the last 4 digits of your phone number.');
    setSending(true);
    setError('');
    try {
      await api.forgotPassword(employeeId.trim(), phoneLast4);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send your request. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="m-login">
      <div className="m-login-hero m-login-hero-compact">
        <span className="m-login-ring-outer" aria-hidden="true" />
        <div className="m-lockup">
          <span className="m-lockup-badge">
            <Icon name="check" size={22} strokeWidth={2.6} />
          </span>
          <span className="m-lockup-text">flexitrack</span>
        </div>
        <div className="m-login-headline">
          <h1>{sent ? 'Request sent' : 'Forgot password?'}</h1>
          <p>{sent ? 'Your incharge has been told.' : 'Your incharge can give you a temporary password.'}</p>
        </div>
      </div>

      {sent ? (
        <div className="m-login-form">
          <section className="m-card m-setting-card" aria-live="polite">
            <ol className="m-steps m-steps-lg">
              <li>
                If the details match your account, your <b>incharge</b> gets your request now.
              </li>
              <li>
                They will <b>call you</b> to check it's really you, then give you a <b>temporary password</b> (it works for 24
                hours).
              </li>
              <li>
                Sign in with your Employee ID and that temporary password, then choose your own new password.
              </li>
            </ol>
            <p className="m-setting-help">
              Not heard back? Ask your incharge in person. Your request stays open for 2 days; asking again just reminds them.
            </p>
          </section>
          <Link to="/login" className="m-btn m-btn-primary m-btn-block m-btn-cta" style={{ textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="m-login-form" onSubmit={submit} noValidate>
          <TextField
            label="Employee ID"
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value.toUpperCase());
              setError('');
            }}
            placeholder="Enter ID"
            autoCapitalize="characters"
            autoComplete="username"
            spellCheck={false}
            inputClassName="m-input-lg m-mono"
            error={!!error && !employeeId.trim()}
          />
          <TextField
            label="Last 4 digits of your phone number"
            value={phoneLast4}
            onChange={(e) => {
              setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4));
              setError('');
            }}
            placeholder="e.g. 3210"
            inputMode="numeric"
            autoComplete="off"
            inputClassName="m-input-lg m-mono"
            error={!!error && phoneLast4.length !== 4}
          />
          <p className="m-hint">The phone number your incharge or HR has for you.</p>

          {error ? (
            <p className="m-form-error" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" block loading={sending} className="m-btn-cta">
            Send request to my incharge
          </Button>
          <Link to="/login" className="m-link m-staff-link" style={{ alignSelf: 'center' }}>
            Back to sign in
          </Link>
        </form>
      )}
    </div>
  );
}
