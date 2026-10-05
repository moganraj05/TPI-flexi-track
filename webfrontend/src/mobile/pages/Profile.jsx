import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { InstallCard } from '../components/InstallCard';
import { NotificationSettings } from '../components/NotificationSettings';
import { ThemeSettings } from '../components/ThemeSettings';
import { Avatar, Button, DetailRow } from '../components/ui';
import { useMobileAuth } from '../context/AuthContext';
import { formatShiftLabel, isInchargeRole, roleLabel } from '../utils';

// Profile tab, shared by workers and incharges (they differ only in which
// details are listed and what the notification card says it's for).
export function ProfilePage() {
  const { user, logout } = useMobileAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const incharge = isInchargeRole(user?.role);

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="m-screen">
      <div className="m-identity">
        <Avatar name={user?.name} employeeId={user?.employeeId} size={92} />
        <h1 className="m-identity-name">{user?.name}</h1>
        <div className="m-pill-row m-center">
          <span className="m-role-pill">{roleLabel(user?.role)}</span>
          <span className="m-id-pill m-mono">{user?.employeeId}</span>
        </div>
      </div>

      <div className="m-body">
        <section className="m-card m-details">
          <DetailRow label="Department" value={user?.department?.name || '-'} />
          {incharge ? (
            <DetailRow label="Dept code" value={user?.department?.code || '-'} />
          ) : (
            <DetailRow label="Shift" value={formatShiftLabel(user?.shiftStart, user?.shiftEnd)} />
          )}
          <DetailRow label="Phone" value={user?.phone || 'Not set'} />
        </section>

        <NotificationSettings
          helper={
            incharge
              ? 'Get the final head count on this device as soon as one of your polls closes.'
              : 'Get an alert on this device when your attendance poll opens, and a reminder before it closes.'
          }
        />

        <InstallCard />

        <h2 className="m-section-title m-section-pad">Appearance</h2>
        <ThemeSettings />

        <Button variant="dangerSoft" block onClick={handleLogout} loading={signingOut} icon={<Icon name="logout" size={18} />}>
          Sign out
        </Button>
        <p className="m-version m-mono">flexitrack web</p>
      </div>
    </div>
  );
}
