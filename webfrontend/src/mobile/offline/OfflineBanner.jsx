import { Icon } from '../components/Icon';
import { useMobileAuth } from '../context/AuthContext';
import { useOnline } from '../../hooks/useOnline';
import { useOutbox } from './outbox';

// Thin strip at the top of every screen while offline (and while answers are
// still waiting to be sent after the connection is back).
export function OfflineBanner() {
  const online = useOnline();
  const { user } = useMobileAuth();
  const waiting = useOutbox(user?.id).length;
  if (online && waiting === 0) return null;

  return (
    <div className={`m-offline-banner${online ? ' m-offline-banner-sync' : ''}`} role="status" aria-live="polite">
      <Icon name={online ? 'cloud-up' : 'wifi-off'} size={16} />
      <span>
        {online
          ? `Sending ${waiting === 1 ? 'your saved answer' : `${waiting} saved answers`}…`
          : `You're offline · showing saved data${waiting ? ` · ${waiting === 1 ? '1 answer' : `${waiting} answers`} waiting to send` : ''}`}
      </span>
    </div>
  );
}
