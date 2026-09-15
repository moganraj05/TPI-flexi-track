const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n) => String(n).padStart(2, '0');

const isValidShiftTime = (value) => typeof value === 'string' && TIME_RE.test(value);

const parseHHMM = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { h, m, minutes: h * 60 + m };
};

const atTime = (date, hhmm) => {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const isOvernightShift = (shiftStart, shiftEnd) => parseHHMM(shiftEnd).minutes <= parseHHMM(shiftStart).minutes;

const isCurrentlyOnShift = (now, shiftStart, shiftEnd) => {
  const startToday = atTime(now, shiftStart);
  const endToday = atTime(now, shiftEnd);
  if (isOvernightShift(shiftStart, shiftEnd)) {
    return now >= startToday || now < endToday;
  }
  return now >= startToday && now < endToday;
};

const getLastCompletedShiftEnd = (now, shiftStart, shiftEnd) => {
  const endToday = atTime(now, shiftEnd);
  if (isOvernightShift(shiftStart, shiftEnd)) {
    if (now < endToday) {
      return atTime(addDays(now, -1), shiftEnd);
    }
    return endToday;
  }
  if (now >= endToday) return endToday;
  return atTime(addDays(now, -1), shiftEnd);
};

const getNextShiftStartAfter = (afterTime, shiftStart) => {
  const sameDay = atTime(afterTime, shiftStart);
  if (sameDay > afterTime) return sameDay;
  return atTime(addDays(afterTime, 1), shiftStart);
};

const getPollWindow = (
  now,
  shiftStart,
  shiftEnd,
  { openDelayMinutes = 30, closeBeforeHours = 2 } = {}
) => {
  const lastEnd = getLastCompletedShiftEnd(now, shiftStart, shiftEnd);
  const opensAt = new Date(lastEnd.getTime() + openDelayMinutes * 60 * 1000);
  const nextStart = getNextShiftStartAfter(lastEnd, shiftStart);
  const closesAt = new Date(nextStart.getTime() - closeBeforeHours * 60 * 60 * 1000);
  return {
    lastEnd,
    opensAt,
    nextStart,
    closesAt,
    valid: closesAt.getTime() > opensAt.getTime(),
  };
};

const formatShiftLabel = (shiftStart, shiftEnd) => `${shiftStart}–${shiftEnd}`;

const toHHMM = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const DEFAULT_SHIFT_START = '08:00';
const DEFAULT_SHIFT_END = '20:00';

module.exports = {
  TIME_RE,
  isValidShiftTime,
  parseHHMM,
  atTime,
  addDays,
  isOvernightShift,
  isCurrentlyOnShift,
  getLastCompletedShiftEnd,
  getNextShiftStartAfter,
  getPollWindow,
  formatShiftLabel,
  toHHMM,
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
};
