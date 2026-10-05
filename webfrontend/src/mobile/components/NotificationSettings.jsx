import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { Button } from './ui';
import { api } from '../api';
import { useMobileToast } from '../context/ToastContext';
import {
  disablePush,
  enablePush,
  getCurrentSubscription,
  notificationPermission,
  pushUnavailableReason,
  unavailableMessage,
} from '../push';

// Notifications card on Profile: turn browser notifications on/off for this
// device, send a test, and explain plainly why it can't work when it can't
// (not https, iPhone not added to Home Screen, blocked, not set up on server).
export function NotificationSettings({ helper }) {
  const toast = useMobileToast();
  const queryClient = useQueryClient();
  const unavailable = pushUnavailableReason();
  const [deviceOn, setDeviceOn] = useState(null); // null = checking
  const [permission, setPermission] = useState(notificationPermission);
  const [busy, setBusy] = useState(false);

  const keyQuery = useQuery({
    queryKey: ['m', 'push-key'],
    queryFn: api.getPushPublicKey,
    staleTime: Infinity,
    enabled: !unavailable,
  });
  const serverEnabled = keyQuery.data?.data?.enabled;

  const checkDevice = useCallback(async () => {
    const subscription = await getCurrentSubscription();
    setDeviceOn(!!subscription && notificationPermission() === 'granted');
    setPermission(notificationPermission());
  }, []);

  useEffect(() => {
    if (unavailable) {
      setDeviceOn(false);
      return;
    }
    checkDevice();
  }, [unavailable, checkDevice]);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      await checkDevice();
      queryClient.invalidateQueries({ queryKey: ['m', 'team'] });
      toast('Notifications on', 'You will get an alert when a poll opens');
    } catch (error) {
      setPermission(notificationPermission());
      toast(error.message || 'Could not turn on notifications', null, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      await checkDevice();
      toast('Notifications off', 'This device will not get poll alerts');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await api.sendTestPush();
      toast('Test sent', 'It should arrive in a few seconds');
    } catch (error) {
      toast(error.message, null, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  let statusText;
  let tone;
  let note = null;
  let action = null;

  if (unavailable) {
    statusText = 'Not available here';
    tone = 'stop';
    note = unavailableMessage(unavailable);
  } else if (deviceOn === null || keyQuery.isLoading) {
    statusText = 'Checking…';
    tone = 'muted';
  } else if (keyQuery.isError) {
    statusText = 'Could not check';
    tone = 'stop';
    note = 'FlexiTrack could not be reached. Try again when you are connected.';
  } else if (!serverEnabled) {
    statusText = 'Not set up yet';
    tone = 'stop';
    note = 'Notifications are not switched on for FlexiTrack yet. Please tell your HR team.';
  } else if (permission === 'denied') {
    statusText = 'Blocked';
    tone = 'stop';
    note = 'Notifications are blocked for this site. Allow them in your browser settings (the lock icon next to the address), then come back here.';
  } else if (deviceOn) {
    statusText = 'On for this device';
    tone = 'go';
    action = (
      <Button variant="field" className="m-btn-sm" onClick={turnOff} disabled={busy}>
        Turn off
      </Button>
    );
  } else {
    statusText = 'Off on this device';
    tone = 'stop';
    action = (
      <Button variant="brand" className="m-btn-sm" onClick={turnOn} loading={busy}>
        Turn on
      </Button>
    );
  }

  return (
    <section className="m-card m-setting-card" aria-label="Notifications">
      <div className="m-setting-row">
        <span className={`m-setting-icon m-tint-${tone === 'go' ? 'go' : tone === 'muted' ? 'muted' : 'stop'}`}>
          <Icon name={tone === 'go' ? 'bell' : 'bell-off'} size={20} />
        </span>
        <div className="m-setting-text">
          <div className="m-setting-title">Notifications</div>
          <div className={`m-setting-status m-text-${tone}`}>{statusText}</div>
        </div>
        {action}
      </div>
      <p className="m-setting-help">{note || helper}</p>
      {deviceOn && serverEnabled ? (
        <button type="button" className="m-link-btn" onClick={sendTest} disabled={busy}>
          Send a test notification
        </button>
      ) : null}
    </section>
  );
}
