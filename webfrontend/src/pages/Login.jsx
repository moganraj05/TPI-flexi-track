import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import brandMark from '../assets/brand-mark.svg';

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

const fieldIconStyle = { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: theme.mutedColor, pointerEvents: 'none' };
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
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={theme.loginPage}>
      <div style={theme.loginLeftPanel}>
        <img src={brandMark} alt="" style={theme.loginWatermark} aria-hidden="true" />
        <div style={theme.loginLogoGlow} aria-hidden="true" />
        <div style={{ position: 'relative' }}>
          <div style={theme.loginBadge}>Ops Console</div>
          <img src={brandMark} alt="" style={{ width: 88, height: 88, display: 'block', marginBottom: 20 }} />
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>FlexiTrack</div>
        </div>
      </div>

      <div style={theme.loginRightPanel}>
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
              placeholder="hr.admin@flexitrack.com"
              style={fieldInputStyle}
              className="ft-login-input"
            />
          </div>

          <label style={theme.label}>Password</label>
          <div style={{ position: 'relative' }}>
            <LockIcon style={fieldIconStyle} />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={fieldInputStyle}
              className="ft-login-input"
            />
          </div>

          {error && <div style={theme.errorText}>{error}</div>}

          <button type="submit" disabled={submitting} className="ft-btn" style={{ ...theme.primaryBtn, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
