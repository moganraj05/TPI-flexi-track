import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getResetRequestSummary } from '../../api/hr';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Pops up a message in the open console when a new password reset request
// reaches Staff & Admin (an incharge asked, or a worker's request wasn't
// handled in time). Shares the sidebar badge's query, which the
// "reset:update" socket event keeps live — no extra requests.
export function ResetRequestAlerts() {
  const { user } = useAuth();
  const toast = useToast();
  const previous = useRef(null);
  const { data } = useQuery({
    queryKey: ['hr-reset-summary'],
    queryFn: getResetRequestSummary,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!user,
  });
  const waiting = data?.hr;

  useEffect(() => {
    if (waiting === undefined) return;
    if (previous.current !== null && waiting > previous.current) {
      const added = waiting - previous.current;
      toast(
        added === 1
          ? 'New password reset request — open Password requests to handle it'
          : `${added} new password reset requests — open Password requests to handle them`,
        'info',
        8000
      );
    }
    previous.current = waiting;
  }, [waiting, toast]);

  return null;
}
