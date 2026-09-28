// Built from the LOCAL calendar date (server runs in IST) but pinned to UTC
// midnight of that same day — not local midnight. Poll.date is a Postgres
// `date` column, and the pg driver serializes a JS Date using its UTC
// components; a local-midnight Date (e.g. via setHours(0,0,0,0)) sits at
// 18:30 UTC the *previous* day for any IST offset ahead of UTC, so it got
// stored one calendar day early for most of the day. This matches the
// pattern hr.controller.js's own date-range filter already uses
// (`new Date(`${fromDate}T00:00:00.000Z`)`) — UTC midnight is the one
// representation that round-trips correctly through that column type.
const getStartOfDay = (date = new Date()) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const getEndOfDay = (date = new Date()) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
};

module.exports = { getStartOfDay, getEndOfDay };
