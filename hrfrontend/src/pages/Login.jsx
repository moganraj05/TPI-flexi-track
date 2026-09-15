import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authed') {
    return <Navigate to="/app/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>FT</div>
        <h1 style={styles.title}>FlexiTrack HR</h1>
        <p style={styles.subtitle}>Sign in with your HR account to view attendance and reports.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hr@tpi.local"
              autoComplete="username"
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Password
            <div style={styles.passwordWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={{ ...styles.input, marginBottom: 0, paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={submitting} style={styles.submit}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, var(--blue-deep) 0%, var(--surface) 55%)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    background: 'var(--white)',
    borderRadius: 'var(--radius-sheet)',
    padding: '36px 28px',
    boxShadow: '0 30px 60px rgba(23, 48, 107, 0.25)',
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: 'var(--blue)',
    color: 'var(--white)',
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 800,
    fontSize: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 24,
    marginBottom: 6,
  },
  subtitle: {
    margin: '0 0 24px',
    fontSize: 13,
    color: 'var(--ink-soft)',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--ink-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  input: {
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-control)',
    padding: '12px 14px',
    fontSize: 15,
    color: 'var(--ink)',
    width: '100%',
    minHeight: 44,
  },
  passwordWrap: {
    position: 'relative',
    display: 'flex',
  },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    color: 'var(--blue)',
    fontSize: 12,
    fontWeight: 700,
    height: 32,
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    margin: 0,
    background: 'var(--red-tint)',
    color: 'var(--red)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-control)',
    fontSize: 13,
    fontWeight: 600,
  },
  submit: {
    border: 'none',
    background: 'var(--blue)',
    color: 'var(--white)',
    fontWeight: 800,
    fontFamily: 'Manrope, sans-serif',
    fontSize: 15,
    borderRadius: 'var(--radius-control)',
    padding: '13px 14px',
    minHeight: 46,
  },
};
