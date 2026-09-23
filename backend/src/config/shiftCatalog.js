// Single source of truth for the fixed set of shifts the plant currently
// runs. Deliberately a plain constant, not a DB table — there's exactly one
// active plant (TCD) and these 5 shifts don't change often enough to justify
// a schema migration; User/Poll keep their existing shiftStart/shiftEnd/
// shiftName string columns, populated FROM this catalog instead of typed
// freely.
const { isValidShiftTime } = require('../utils/shift');

const SHIFT_CATALOG = [
  { code: 'A', name: 'Shift A', category: 'general', shiftStart: '08:00', shiftEnd: '16:00' },
  { code: 'B', name: 'Shift B', category: 'general', shiftStart: '16:00', shiftEnd: '00:00' },
  { code: 'C', name: 'Shift C', category: 'general', shiftStart: '00:00', shiftEnd: '08:00' },
  { code: 'D', name: 'Shift D', category: 'contract', shiftStart: '08:00', shiftEnd: '20:00' },
  { code: 'E', name: 'Shift E', category: 'contract', shiftStart: '20:00', shiftEnd: '08:00' },
];

const getShiftCatalog = () => SHIFT_CATALOG.map((s) => ({ ...s }));

const getShiftByCode = (code) => SHIFT_CATALOG.find((s) => s.code === String(code || '').trim().toUpperCase()) || null;

const getShiftByTimes = (shiftStart, shiftEnd) =>
  SHIFT_CATALOG.find((s) => s.shiftStart === shiftStart && s.shiftEnd === shiftEnd) || null;

// "08:00" -> "8:00 AM", "16:00" -> "4:00 PM", "00:00" -> "12:00 AM" — every
// user-facing shift label uses this, never the raw 24h HH:mm the catalog
// stores internally, per an explicit "no railway time, AM/PM only" ask.
const formatTime12h = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

const formatTimeRange12h = (shiftStart, shiftEnd) => `${formatTime12h(shiftStart)} – ${formatTime12h(shiftEnd)}`;

// "Shift A · 8:00 AM – 4:00 PM" when the pair matches a catalog entry,
// otherwise a bare 12h time range — so historical/legacy rows that predate
// the catalog (or a future non-TCD plant with its own times) still render
// something sensible instead of blowing up.
const formatShiftName = (shiftStart, shiftEnd) => {
  const entry = getShiftByTimes(shiftStart, shiftEnd);
  const label = formatTimeRange12h(shiftStart, shiftEnd);
  return entry ? `${entry.name} · ${label}` : label;
};

// Resolves a create/update request body into concrete shiftStart/shiftEnd/
// shiftName values. Prefers a catalog `shiftCode` (the new, canonical path);
// falls back to raw shiftStart/shiftEnd (kept for backward compatibility
// with any caller — an older mobile build, a script — still posting times
// directly). Returns { error } on anything invalid.
const resolveShift = (body, fallbackStart, fallbackEnd) => {
  if (body.shiftCode !== undefined && body.shiftCode !== null && body.shiftCode !== '') {
    const entry = getShiftByCode(body.shiftCode);
    if (!entry) return { error: 'Invalid shift code' };
    return { shiftStart: entry.shiftStart, shiftEnd: entry.shiftEnd, shiftName: entry.name };
  }

  const shiftStart = body.shiftStart !== undefined ? String(body.shiftStart).trim() : fallbackStart;
  const shiftEnd = body.shiftEnd !== undefined ? String(body.shiftEnd).trim() : fallbackEnd;

  if (!isValidShiftTime(shiftStart) || !isValidShiftTime(shiftEnd)) {
    return { error: 'Shift times must be in HH:mm format (e.g. 08:00)' };
  }
  if (shiftStart === shiftEnd) {
    return { error: 'Shift start and end cannot be the same time' };
  }

  const matched = getShiftByTimes(shiftStart, shiftEnd);
  return { shiftStart, shiftEnd, shiftName: matched ? matched.name : undefined };
};

module.exports = {
  SHIFT_CATALOG,
  getShiftCatalog,
  getShiftByCode,
  getShiftByTimes,
  formatTime12h,
  formatTimeRange12h,
  formatShiftName,
  resolveShift,
};
