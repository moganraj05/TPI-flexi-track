import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { theme, SUCCESS } from '../theme';
import { getRegistrationPlants, sendRegisterOtp, verifyRegisterOtp, completeRegistration } from '../api/hr';
import { AuthLayout, AuthHeading, StepDots } from '../components/auth/AuthLayout';
import { authLinkStyle } from '../components/auth/authStyles';
import { OtpStep } from '../components/auth/OtpStep';
import { PasswordStep } from '../components/auth/PasswordStep';

// Mirrors the backend default (HR_ALLOWED_EMAIL_DOMAINS). The server is what
// enforces it; this only saves a round trip for an obviously wrong address.
const ALLOWED_DOMAIN = 'tii.murugappa.com';

const EMPTY = { name: '', employeeId: '', department: '', phone: '', email: '' };

// HR self-registration: details -> email code -> set password -> waits for
// an admin to approve before the first sign-in.
export function Register() {
  const [step, setStep] = useState('details'); // details | otp | password | done
  const [form, setForm] = useState(EMPTY);
  const [otpMeta, setOtpMeta] = useState(null);
  const [ticket, setTicket] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  const { data: plants, isLoading: plantsLoading, error: plantsError } = useQuery({
    queryKey: ['register-plants'],
    queryFn: getRegistrationPlants,
    staleTime: 5 * 60 * 1000,
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const sendCode = async () => {
    const result = await sendRegisterOtp({ ...form, email: form.email.trim().toLowerCase() });
    setOtpMeta(result);
    return result;
  };

  const submitDetails = async (e) => {
    e.preventDefault();
    setError('');
    const address = form.email.trim().toLowerCase();
    if (!form.name.trim() || !form.employeeId.trim() || !form.department || !form.phone.trim() || !address) {
      setError('All fields are required');
      return;
    }
    if (!address.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setError(`Use your @${ALLOWED_DOMAIN} email address`);
      return;
    }
    if (!/^\+?[0-9\s-]{7,15}$/.test(form.phone.trim())) {
      setError('Enter a valid phone number');
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
    const { ticket: t } = await verifyRegisterOtp(form.email.trim().toLowerCase(), code);
    setTicket(t);
    setStep('password');
  };

  const finish = async ({ password, confirmPassword }) => {
    const result = await completeRegistration({ ticket, password, confirmPassword });
    setDoneMessage(result.message);
    setStep('done');
  };

  const stepNumber = { details: 1, otp: 2, password: 3, done: 3 }[step];

  return (
    <AuthLayout>
      <div style={{ ...theme.loginCard, maxWidth: 440 }} className="ft-fade-in">
        {step !== 'done' && <StepDots step={stepNumber} total={3} />}

        {step === 'details' && (
          <form onSubmit={submitDetails}>
            <AuthHeading title="Create HR account" subtitle="Step 1 of 3 — your details. We'll email you a verification code." />

            <label style={theme.label} htmlFor="reg-name">Full name</label>
            <input id="reg-name" value={form.name} onChange={set('name')} autoComplete="name" maxLength={100} style={theme.input} className="ft-login-input" />

            <label style={theme.label} htmlFor="reg-empid">Employee ID</label>
            <input id="reg-empid" value={form.employeeId} onChange={set('employeeId')} maxLength={30} style={{ ...theme.input, textTransform: 'uppercase' }} className="ft-login-input" />

            <label style={theme.label} htmlFor="reg-plant">Plant</label>
            <select id="reg-plant" value={form.department} onChange={set('department')} style={theme.input} disabled={plantsLoading}>
              <option value="">{plantsLoading ? 'Loading plants…' : 'Select your plant'}</option>
              {(plants || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            {plantsError && <div style={theme.errorText}>Could not load plants. Refresh the page to try again.</div>}

            <label style={theme.label} htmlFor="reg-phone">Phone number</label>
            <input id="reg-phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" maxLength={15} style={theme.input} className="ft-login-input" />

            <label style={theme.label} htmlFor="reg-email">Work email</label>
            <input
              id="reg-email"
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              placeholder={`name@${ALLOWED_DOMAIN}`}
              style={theme.input}
              className="ft-login-input"
            />

            {error && <div style={theme.errorText}>{error}</div>}

            <button type="submit" disabled={busy} className="ft-btn" style={{ ...theme.primaryBtn, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Sending code…' : 'Send verification code'}
            </button>

            <div style={{ marginTop: 16, fontSize: 13, color: theme.mutedColor, textAlign: 'center' }}>
              Already have an account?{' '}
              <Link to="/staff/login" style={authLinkStyle}>
                Sign in
              </Link>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <>
            <AuthHeading title="Verify your email" subtitle="Step 2 of 3" />
            <OtpStep
              email={form.email.trim().toLowerCase()}
              expiresInMinutes={otpMeta?.expiresInMinutes}
              resendAfterSeconds={otpMeta?.resendAfterSeconds}
              onVerify={verify}
              onResend={sendCode}
              onChangeEmail={() => setStep('details')}
            />
          </>
        )}

        {step === 'password' && (
          <>
            <AuthHeading title="Set your password" subtitle="Step 3 of 3 — email verified." />
            <PasswordStep submitLabel="Create account" onSubmit={finish} />
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, color: SUCCESS, lineHeight: 1 }} aria-hidden="true">✓</div>
            <AuthHeading title="Registration submitted" />
            <div style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 1.6, marginTop: 10 }}>
              {doneMessage || 'An administrator must approve your account before you can sign in.'}
              <br />
              You'll get an email at <b>{form.email.trim().toLowerCase()}</b> once it's approved.
            </div>
            <Link to="/staff/login" className="ft-btn" style={{ ...theme.primaryBtn, display: 'block', textDecoration: 'none', textAlign: 'center' }}>
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
