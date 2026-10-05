import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button, PasswordInput, TextField } from '../components/ui';
import { useMobileAuth } from '../context/AuthContext';
import { homeRouteFor } from '../utils';

// Demo accounts from the seed data — shown only in development builds, never
// on the real site.
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? [
      { label: 'Worker', id: 'EMP1042', password: 'password123' },
      { label: 'Incharge', id: 'INC001', password: 'password123' },
    ]
  : [];

export function LoginPage() {
  const { login, status, user } = useMobileAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStaffAccount, setIsStaffAccount] = useState(false);

  if (status === 'authed' && user) return <Navigate to={homeRouteFor(user.role)} replace />;

  const clearError = () => {
    setError('');
    setIsStaffAccount(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId.trim() || !password) {
      setError('Enter your Employee ID and password.');
      return;
    }
    setLoading(true);
    clearError();
    try {
      const signedIn = await login(employeeId.trim(), password);
      navigate(homeRouteFor(signedIn.role), { replace: true });
    } catch (err) {
      // 401 = wrong ID/password; 403 = an HR/admin account (they sign in at
      // /staff); status 0 = the server could not be reached at all.
      if (err.status === 401) setError("That ID and password don't match. Try again.");
      else setError(err.message || 'Something went wrong. Try again.');
      setIsStaffAccount(err.status === 403);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-login">
      <div className="m-login-hero">
        <span className="m-login-ring-outer" aria-hidden="true" />
        <span className="m-login-ring-inner" aria-hidden="true" />
        <div className="m-lockup">
          <span className="m-lockup-badge">
            <Icon name="check" size={22} strokeWidth={2.6} />
          </span>
          <span className="m-lockup-text">flexitrack</span>
        </div>
        <div className="m-login-headline">
          <h1>
            Coming in?
            <br />
            Tell us in one tap.
          </h1>
          <p>Employee attendance poll</p>
        </div>
      </div>

      <form className="m-login-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Employee ID"
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value.toUpperCase());
            clearError();
          }}
          placeholder="Enter ID"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          inputClassName="m-input-lg m-mono"
          error={!!error}
        />
        <PasswordInput
          label="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearError();
          }}
          placeholder="Enter password"
          autoComplete="current-password"
          error={!!error}
        />

        {error ? (
          <p className="m-form-error" role="alert">
            {error}
            {isStaffAccount ? (
              <>
                {' '}
                <Link to="/staff/login" className="m-link">
                  Go to staff sign in
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <Button type="submit" variant="primary" block loading={loading} className="m-btn-cta">
          Sign in
          <Icon name="arrow-right" size={18} />
        </Button>
      </form>

      <div className="m-login-footer">
        {DEMO_ACCOUNTS.length ? (
          <div className="m-demo-row">
            {DEMO_ACCOUNTS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                className="m-demo-chip"
                onClick={() => {
                  setEmployeeId(demo.id);
                  setPassword(demo.password);
                  clearError();
                }}
              >
                <b>{demo.label}</b> <span className="m-mono">{demo.id}</span>
              </button>
            ))}
          </div>
        ) : null}
        <Link to="/staff/login" className="m-link m-staff-link">
          HR or admin? Sign in to the staff console
        </Link>
      </div>
    </div>
  );
}
