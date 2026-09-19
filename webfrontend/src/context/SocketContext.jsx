import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketURL, getToken } from '../api/client';
import { useAuth } from './AuthContext';

// Pushes live updates to whichever screens show poll/attendance data, instead
// of them waiting for their next scheduled refetchInterval. Those intervals
// stay in place as a fallback — if the socket is ever down (offline, a
// firewall blocking WebSocket upgrades, etc.) the screens still self-heal
// within their existing poll interval.
const SocketContext = createContext(null);

// Mirrors the messages realtime.js's `io.use` auth middleware throws — a
// socket that fails for one of these reasons has a token REST already knows
// is dead (or is about to find out via its next 401), so retrying forever
// with that same token is pointless. Retiring the socket here doesn't log
// anyone out itself; client.js's own 401 interceptor -> AuthContext already
// owns that, and it will tear this socket down for good once `status` flips
// to 'guest'.
const AUTH_ERROR_MESSAGES = new Set([
  'Authentication required',
  'Invalid or inactive account',
  'Session expired, please log in again',
  'Invalid or expired token',
]);

// Every query a poll/follow-up event could possibly affect. Individual event
// handlers below scope this down further (e.g. to one poll/employee) where
// the payload tells us exactly what changed; reconnect can't do that — we
// don't know what we missed while offline — so it resyncs this whole set
// instead of waiting for each page's own poll interval to catch up.
function invalidateRealtimeQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['hr-live'] });
  queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
  queryClient.invalidateQueries({ queryKey: ['hr-polls'] });
  queryClient.invalidateQueries({ queryKey: ['hr-poll-detail'] });
  queryClient.invalidateQueries({ queryKey: ['hr-employee'] });
  queryClient.invalidateQueries({ queryKey: ['hr-follow-ups'] });
}

export function SocketProvider({ children }) {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (status !== 'authed') {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    const token = getToken();
    if (!token) return undefined;

    // socket.io-client is dynamically imported rather than statically, so
    // its bytes aren't part of the initial bundle every visitor pays for
    // (including on /login, before this effect ever reaches an authed
    // status) — they load once, right when a connection is first needed.
    let cancelled = false;
    let socket;
    // Set once the first 'connect' fires. A later 'connect' means socket.io
    // reconnected us after a drop — that's the one we resync on, so a fresh
    // login doesn't immediately re-fetch what the initial page load already
    // just fetched.
    let hasConnectedBefore = false;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;

      socket = io(socketURL, {
        // A function (not a static object) so every connection attempt —
        // including reconnects, possibly minutes later — sends whatever
        // token is current at that moment rather than one captured once at
        // socket-creation time.
        auth: (cb) => cb({ token: getToken() }),
        transports: ['websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        if (hasConnectedBefore) {
          invalidateRealtimeQueries(queryClient);
        }
        hasConnectedBefore = true;
      });

      socket.on('disconnect', (reason) => {
        setConnected(false);
        // Every other disconnect reason already triggers socket.io's own
        // auto-reconnect; this is the one case ("the server hung up on me")
        // where it deliberately doesn't, so nudge it back into that loop —
        // otherwise a server restart/redeploy would leave the client
        // silently offline until the page is reloaded by hand.
        if (reason === 'io server disconnect') {
          socket.connect();
        }
      });

      socket.on('connect_error', (err) => {
        if (AUTH_ERROR_MESSAGES.has(err.message)) {
          socket.disconnect();
        }
      });

      socket.on('poll:update', (payload) => {
        queryClient.invalidateQueries({ queryKey: ['hr-live'] });
        queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
        queryClient.invalidateQueries({ queryKey: ['hr-polls'] });
        if (payload?.pollId) {
          queryClient.invalidateQueries({ queryKey: ['hr-poll-detail', payload.pollId] });
        }
        if (payload?.workerId) {
          queryClient.invalidateQueries({ queryKey: ['hr-employee', payload.workerId] });
        }
      });

      socket.on('followup:update', () => {
        queryClient.invalidateQueries({ queryKey: ['hr-follow-ups'] });
      });
    });

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [status, queryClient]);

  return <SocketContext.Provider value={{ connected }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
