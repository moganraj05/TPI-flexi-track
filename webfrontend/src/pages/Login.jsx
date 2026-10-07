import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authLinkStyle } from '../components/auth/authStyles';
import { PasswordInput } from '../components/common/PasswordInput';

// Small stroke icons for the input fields — no icon library in this project,
// and two glyphs don't justify adding one.
function MailIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}
function LockIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

const fieldIconStyle = { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: theme.mutedColor, pointerEvents: 'none', zIndex: 1 };
const fieldInputStyle = { ...theme.input, paddingLeft: 38 };

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/staff/app/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
        <form onSubmit={handleSubmit} style={theme.loginCard} className="ft-fade-in">
          <div style={{ fontSize: 22, fontWeight: 800, color: theme.textPrimary }}>Sign in</div>
          <div style={{ fontSize: 13, color: theme.mutedColor, marginTop: 4, marginBottom: 8 }}>
            Enter your HR/admin credentials to continue.
          </div>

          <label style={theme.label}>Email</label>
          <div style={{ position: 'relative' }}>
            <MailIcon style={fieldIconStyle} />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@tii.murugappa.com"
              style={fieldInputStyle}
              className="ft-login-input"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label style={theme.label}>Password</label>
            <Link to="/staff/forgot-password" style={{ ...authLinkStyle, fontSize: 12 }}>
              Forgot password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <LockIcon style={fieldIconStyle} />
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              style={fieldInputStyle}
              className="ft-login-input"
            />
          </div>

          {error && <div style={theme.errorText}>{error}</div>}

          <button type="submit" disabled={submitting} className="ft-btn" style={{ ...theme.primaryBtn, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{ marginTop: 16, fontSize: 13, color: theme.mutedColor, textAlign: 'center' }}>
            New HR user?{' '}
            <Link to="/staff/register" style={authLinkStyle}>
              Create an account
            </Link>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: theme.mutedColor, textAlign: 'center' }}>
            Worker or incharge?{' '}
            <Link to="/login" style={authLinkStyle}>
              Sign in here
            </Link>
          </div>
        </form>
    </AuthLayout>
  );
}
