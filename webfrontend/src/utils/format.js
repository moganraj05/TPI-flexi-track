export const formatDate = (value, opts = {}) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
};

export const formatDateShort = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const formatTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  return `${formatDateShort(value)}, ${formatTime(value)}`;
};

export const toDateInputValue = (value) => {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'HR';

export const countdown = (targetIso) => {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return 'closing…';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

export const shiftLabel = (poll) =>
  poll?.shiftStart && poll?.shiftEnd ? `${poll.shiftStart}–${poll.shiftEnd}` : poll?.shift || 'Shift';

export const secondsAgo = (timestamp) => {
  if (!timestamp) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
};
