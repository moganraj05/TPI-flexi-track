import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../theme';
import { acceptStaffInvite, verifyStaffInvite } from '../api/hr';
import { AuthHeading, AuthLayout } from '../components/auth/AuthLayout';
import { PasswordStep } from '../components/auth/PasswordStep';
import { authLinkStyle } from '../components/auth/authStyles';
import { Spinner } from '../components/common/Spinner';

// Read once: the invitation token is in the URL fragment (#token=...), which
// browsers never send to a server. It's taken out of the address bar right
// away so it doesn't stay in history or get copied along with the URL.
function takeTokenFromUrl() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get('token') || '';
  if (token) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

const signInButtonStyle = { ...theme.primaryBtn, display: 'block', textDecoration: 'none', textAlign: 'center' };

// Where an invited Staff/Admin sets their own password, from the link in
// the invitation email an admin's "Add login" sent them.
export function SetPassword() {
  const [token] = useState(takeTokenFromUrl);
  const [state, setState] = useState(token ? 'checking' : 'invalid'); // checking | ready | invalid | done
  const [account, setAccount] = useState(null);
  const [problem, setProblem] = useState(token ? '' : 'This page needs the link from your invitation email. Open the email and use its “Set my password” button.');

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    verifyStaffInvite(token)
      .then((info) => {
        if (cancelled) return;
        setAccount(info);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setProblem(err.message || 'This invitation link is not valid.');
        setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout>
      <div style={theme.loginCard} className="ft-fade-in">
        {state === 'checking' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0', color: theme.mutedColor, fontSize: 13 }}>
            <Spinner size={44} />
            Checking your invitation…
          </div>
        )}

        {state === 'invalid' && (
          <>
            <AuthHeading title="Link can’t be used" subtitle={problem} />
            <div style={{ fontSize: 13, color: theme.mutedColor, lineHeight: 1.55, marginTop: 8 }}>
              Ask your admin to send a new invitation from Settings. If you already set a password, sign in instead.
            </div>
            <Link to="/staff/login" className="ft-btn" style={signInButtonStyle}>
              Go to sign in
            </Link>
          </>
        )}

        {state === 'ready' && (
          <>
            <AuthHeading title="Set your password" subtitle={`Welcome, ${account.name}. Choose a password for ${account.email} (${account.role}).`} />
            <PasswordStep
              submitLabel="Set password"
              onSubmit={async ({ password, confirmPassword }) => {
                await acceptStaffInvite({ token, password, confirmPassword });
                setState('done');
              }}
            />
          </>
        )}

        {state === 'done' && (
          <>
            <AuthHeading title="Password set" subtitle="Your login is ready. Sign in with your email address and the password you just chose." />
            <Link to="/staff/login" className="ft-btn" style={signInButtonStyle}>
              Sign in
            </Link>
          </>
        )}

        {state !== 'done' && state !== 'invalid' && (
          <div style={{ marginTop: 16, fontSize: 13, color: theme.mutedColor, textAlign: 'center' }}>
            Already set it?{' '}
            <Link to="/staff/login" style={authLinkStyle}>
              Sign in
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
