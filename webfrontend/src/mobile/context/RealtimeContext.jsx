import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketURL } from '../../api/client';
import { tokenStorage } from '../api';
import { useMobileAuth } from './AuthContext';

// Mirrors realtime.js's socket auth errors — retrying with a token the server
// has already rejected is pointless; the next REST call's 401 signs out.
const AUTH_ERROR_MESSAGES = new Set([
  'Authentication required',
  'Invalid or inactive account',
  'Session expired, please log in again',
  'Invalid or expired token',
]);

// Live updates for the worker / incharge app. The backend puts this user's
// socket in their department's room and emits `poll:update` whenever a poll
// there is created, answered or closed; this turns each event into a refetch
// of exactly the screens it affects (TanStack Query keys under ['m', ...]).
// After a reconnect, or when the phone comes back to the app, everything is
// refetched, since events may have been missed in between.
export function MobileRealtimeProvider({ children }) {
  const { user, status } = useMobileAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (status !== 'authed' || !userId) return undefined;

    let cancelled = false;
    let socket = null;
    let hasConnectedBefore = false;

    const resyncAll = () => queryClient.invalidateQueries({ queryKey: ['m'] });

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;

      socket = io(socketURL, {
        auth: (cb) => cb({ token: tokenStorage.get() }),
        transports: ['websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      socket.on('connect', () => {
        if (hasConnectedBefore) resyncAll();
        hasConnectedBefore = true;
      });

      socket.on('disconnect', (reason) => {
        // The server hanging up (restart/redeploy) is the one case socket.io
        // doesn't retry on its own.
        if (reason === 'io server disconnect') socket.connect();
      });

      socket.on('connect_error', (err) => {
        if (AUTH_ERROR_MESSAGES.has(err.message)) socket.disconnect();
      });

      socket.on('poll:update', (payload) => {
        queryClient.invalidateQueries({ queryKey: ['m', 'today-poll'] });
        queryClient.invalidateQueries({ queryKey: ['m', 'incharge-polls'] });
        queryClient.invalidateQueries({ queryKey: ['m', 'team'] });
        if (payload?.pollId) queryClient.invalidateQueries({ queryKey: ['m', 'incharge-poll', payload.pollId] });
        if (payload?.workerId && payload.workerId === userId) {
          queryClient.invalidateQueries({ queryKey: ['m', 'history'] });
        }
      });
    });

    // Phones freeze background tabs: when the app is shown again, reconnect
    // if needed and refetch what's on screen.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (socket && !socket.connected) socket.connect();
      resyncAll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [status, userId, queryClient]);

  return children;
}
