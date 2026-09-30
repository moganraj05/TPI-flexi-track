import { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme, SUCCESS } from '../theme';
import { sendResetOtp, verifyResetOtp, resetPassword } from '../api/hr';
import { AuthLayout, AuthHeading, StepDots } from '../components/auth/AuthLayout';
import { authLinkStyle } from '../components/auth/authStyles';
import { OtpStep } from '../components/auth/OtpStep';
import { PasswordStep } from '../components/auth/PasswordStep';

// Forgot password: email -> code -> new password. The server answers the
// first step identically for every email, so the page always moves on to
// the code step — it never reveals whether the email has an account.
export function ForgotPassword() {
  const [step, setStep] = useState('email'); // email | otp | password | done
  const [email, setEmail] = useState('');
  const [otpMeta, setOtpMeta] = useState(null);
  const [ticket, setTicket] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = email.trim().toLowerCase();

  const sendCode = async () => {
    const result = await sendResetOtp(normalized);
    setOtpMeta(result);
    return result;
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    setError('');
    if (!normalized) {
      setError('Enter your email address');
      return;
    }
    setBusy(true);
    try {
      await sendCode();
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Could not send the verification code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code) => {
    const { ticket: t } = await verifyResetOtp(normalized, code);
    setTicket(t);
    setStep('password');
  };

  const finish = async ({ password, confirmPassword }) => {
    await resetPassword({ ticket, password, confirmPassword });
    setStep('done');
  };

  const stepNumber = { email: 1, otp: 2, password: 3, done: 3 }[step];

  return (
    <AuthLayout>
      <div style={theme.loginCard} className="ft-fade-in">
        {step !== 'done' && <StepDots step={stepNumber} total={3} />}

        {step === 'email' && (
          <form onSubmit={submitEmail}>
            <AuthHeading title="Forgot password" subtitle="Enter your account email and we'll send you a verification code." />

            <label style={theme.label} htmlFor="fp-email">Email</label>
            <input
              id="fp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              style={theme.input}
              className="ft-login-input"
            />

            {error && <div style={theme.errorText}>{error}</div>}

            <button type="submit" disabled={busy} className="ft-btn" style={{ ...theme.primaryBtn, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Sending code…' : 'Send verification code'}
            </button>

            <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
              <Link to="/login" style={authLinkStyle}>
                ← Back to sign in
              </Link>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <>
            <AuthHeading title="Enter verification code" subtitle="If this email belongs to an active account, a code has been sent to it." />
            <OtpStep
              email={normalized}
              expiresInMinutes={otpMeta?.expiresInMinutes}
              resendAfterSeconds={otpMeta?.resendAfterSeconds}
              onVerify={verify}
              onResend={sendCode}
              onChangeEmail={() => setStep('email')}
            />
          </>
        )}

        {step === 'password' && (
          <>
            <AuthHeading title="Set a new password" subtitle="You'll be signed out of all other devices." />
            <PasswordStep submitLabel="Update password" onSubmit={finish} />
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, color: SUCCESS, lineHeight: 1 }} aria-hidden="true">✓</div>
            <AuthHeading title="Password updated" />
            <div style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 1.6, marginTop: 10 }}>
              Sign in with your new password. All other sessions have been signed out.
            </div>
            <Link to="/login" className="ft-btn" style={{ ...theme.primaryBtn, display: 'block', textDecoration: 'none', textAlign: 'center' }}>
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
