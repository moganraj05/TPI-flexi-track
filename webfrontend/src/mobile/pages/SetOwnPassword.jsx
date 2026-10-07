import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { OwnPasswordForm } from '../components/OwnPasswordForm';
import { Loading } from '../components/ui';
import { useMobileAuth } from '../context/AuthContext';
import { useMobileToast } from '../context/ToastContext';
import { syncPushSubscription } from '../push';
import { homeRouteFor } from '../utils';

// Shown straight after signing in with a temporary password (new account,
// reset) or when an admin required a new password. Nothing else in the app
// opens until this is done — the server enforces the same rule.
export function SetOwnPassword() {
  const { user, status, applyNewSession, logout } = useMobileAuth();
  const navigate = useNavigate();
  const toast = useMobileToast();

  if (status === 'loading') return <Loading />;
  if (status !== 'authed' || !user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={homeRouteFor(user.role)} replace />;

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
          <h1>Set your password</h1>
          <p>
            Hi {user.name.split(' ')[0]} — choose your own password to continue. You'll use it with your Employee ID{' '}
            <b>{user.employeeId}</b> from now on.
          </p>
        </div>
      </div>

      <div className="m-login-form">
        <OwnPasswordForm
          user={user}
          askCurrent={false}
          submitLabel="Save and continue"
          onDone={({ token, user: nextUser }) => {
            applyNewSession({ token, user: nextUser });
            syncPushSubscription();
            toast('Password saved', 'Use it the next time you sign in');
            navigate(homeRouteFor(nextUser.role), { replace: true });
          }}
        />
      </div>

      <div className="m-login-footer">
        <button
          type="button"
          className="m-link-btn"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
