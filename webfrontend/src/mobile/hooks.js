import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

// ---- data (TanStack Query, every key under ['m', ...]) ----
// Refetch when the phone comes back to the app — the Expo app did the same
// with useFocusEffect. Socket events (RealtimeContext) refetch in between.
const live = { refetchOnWindowFocus: true, staleTime: 15 * 1000 };

export const useTodayPoll = ({ enabled = true } = {}) =>
  useQuery({ queryKey: ['m', 'today-poll'], queryFn: api.getTodayPoll, enabled, ...live });

export const useHistory = (page, limit) =>
  useQuery({
    queryKey: ['m', 'history', page, limit],
    queryFn: () => api.getMyResponses({ page, limit }),
    placeholderData: (prev) => prev,
    ...live,
  });

export const useInchargePolls = (page, limit) =>
  useQuery({
    queryKey: ['m', 'incharge-polls', page, limit],
    queryFn: () => api.getInchargePolls({ page, limit }),
    placeholderData: (prev) => prev,
    ...live,
  });

export const useInchargePoll = (pollId) =>
  useQuery({
    queryKey: ['m', 'incharge-poll', pollId],
    queryFn: () => api.getInchargePollDetail(pollId),
    enabled: !!pollId,
    retry: (count, error) => error?.status !== 404 && error?.status !== 403 && count < 1,
    ...live,
  });

export const useTeam = () => useQuery({ queryKey: ['m', 'team'], queryFn: api.getTeamWorkers, ...live });

// status: 'pending' (default) | 'done'. meta.pendingCount feeds the tab badge.
export const useResetRequests = (status = 'pending', { enabled = true } = {}) =>
  useQuery({
    queryKey: ['m', 'reset-requests', status],
    queryFn: () => api.getResetRequests(status),
    enabled,
    ...live,
  });

export const useShiftCatalog = () =>
  useQuery({ queryKey: ['m', 'shifts'], queryFn: api.getShiftCatalog, staleTime: Infinity });

// ---- countdown ----
export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
}

// Ticks every second; reports whether the poll hasn't opened yet / is live /
// has closed, and calls onExpire once when it closes.
export function usePollCountdown(opensAt, closesAt, onExpire) {
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);
  const expiredCalledRef = useRef(false);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const opens = new Date(opensAt).getTime();
  const closes = closesAt ? new Date(closesAt).getTime() : null;
  const isBeforeOpen = now < opens;
  const isExpired = closes !== null ? now >= closes : false;
  const target = isBeforeOpen ? opens : closes ?? opens;
  const display = isExpired ? formatCountdown(0) : formatCountdown(target - now);

  useEffect(() => {
    if (isExpired && !expiredCalledRef.current) {
      expiredCalledRef.current = true;
      onExpireRef.current?.();
    }
    if (!isExpired) expiredCalledRef.current = false;
  }, [isExpired]);

  return { now, display, isExpired, isBeforeOpen, isLive: !isBeforeOpen && !isExpired };
}
