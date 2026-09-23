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

// "08:00" -> "8:00 AM", "16:00" -> "4:00 PM", "00:00" -> "12:00 AM" — never
// the 24h HH:mm the catalog stores internally. Always includes minutes
// (never "8 AM") so this matches the backend's own formatShiftName exactly —
// the same shift should never look different in two places.
export const formatShiftTime12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

// The backend now bakes a catalog-branded label ("Shift A · 08:00–16:00")
// straight into poll.shift at poll-creation time — prefer that when present
// (recognizable by the "·" separator) so this needs no catalog lookup of its
// own; historical polls created before that change fall back to the old
// bare-times construction.
export const shiftLabel = (poll) => {
  if (poll?.shift && poll.shift.includes('·')) return poll.shift;
  return poll?.shiftStart && poll?.shiftEnd
    ? `${formatShiftTime12h(poll.shiftStart)} – ${formatShiftTime12h(poll.shiftEnd)}`
    : poll?.shift || 'Shift';
};

// "Shift A · 8:00 AM – 4:00 PM" for a worker/incharge record (which carries
// shiftName/shiftStart/shiftEnd as separate fields, unlike a poll's
// already-baked `shift` string) — always 12h, never raw 24h HH:mm.
export const memberShiftLabel = (member) => {
  if (!member?.shiftStart || !member?.shiftEnd) return member?.shiftName || '—';
  const times = `${formatShiftTime12h(member.shiftStart)} – ${formatShiftTime12h(member.shiftEnd)}`;
  return member.shiftName ? `${member.shiftName} · ${times}` : times;
};

export const secondsAgo = (timestamp) => {
  if (!timestamp) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
};
