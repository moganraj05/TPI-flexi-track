import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileAuth } from '../context/AuthContext';
import { useMobileToast } from '../context/ToastContext';
import { useOnline } from '../../hooks/useOnline';
import { api } from '../api';
import { flushOutbox, useOutbox } from './outbox';

const RETRY_MS = 30 * 1000;

// Sends poll answers saved while offline (outbox.js) as soon as they can go:
// when the phone comes back online, when the app is reopened or brought to
// the front, and every 30 s while some are waiting (covers Wi-Fi without
// internet, where the phone reports "online" but requests fail).
export function OutboxSync() {
  const { user, status } = useMobileAuth();
  const queryClient = useQueryClient();
  const toast = useMobileToast();
  const online = useOnline();
  const userId = status === 'authed' ? user?.id : null;
  const waiting = useOutbox(userId).length;

  useEffect(() => {
    if (!userId || !online || waiting === 0 || user?.mustChangePassword) return undefined;
    let cancelled = false;
    let running = false;

    const run = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        await flushOutbox(userId, {
          send: (entry) => api.respondToPoll(entry.pollId, entry.answer),
          onSent: (entry, result) => {
            queryClient.setQueryData(['m', 'today-poll'], (prev) =>
              prev?.data?.id === entry.pollId ? { ...prev, data: result.data } : prev
            );
            queryClient.invalidateQueries({ queryKey: ['m', 'history'] });
            toast('Answer sent', entry.answer === 'yes' ? "You're marked as coming" : "You're marked as not coming");
          },
          onRefused: (entry, error) => {
            queryClient.invalidateQueries({ queryKey: ['m', 'today-poll'] });
            toast("Your answer couldn't be sent", error.message || 'The poll may have closed while you were offline.', {
              variant: 'error',
            });
          },
        });
      } finally {
        running = false;
      }
    };

    run();
    const timer = setInterval(run, RETRY_MS);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, online, waiting, user?.mustChangePassword, queryClient, toast]);

  return null;
}
