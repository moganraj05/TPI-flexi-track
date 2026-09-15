import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';

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
      <form onSubmit={handleSubmit} style={theme.loginCard}>
        <div style={theme.loginBrandRow}>
          <div style={theme.loginMark}>FT</div>
          <div style={{ fontFamily: theme.mono, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme.mutedColor }}>
            Ops Console
          </div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: theme.textPrimary, marginBottom: 4 }}>FlexiTrack</div>
        <div style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 28 }}>Flexi-worker attendance, tracked live.</div>

        <label style={theme.label}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hr.admin@flexitrack.com"
          style={theme.input}
        />

        <label style={theme.label}>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={theme.input}
        />

        {error && <div style={theme.errorText}>{error}</div>}

        <button type="submit" disabled={submitting} style={{ ...theme.primaryBtn, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <div style={{ fontSize: 12, color: theme.mutedColor, textAlign: 'center', marginTop: 16 }}>
          Internal HR / Admin access only
        </div>
      </form>
    </div>
  );
}
