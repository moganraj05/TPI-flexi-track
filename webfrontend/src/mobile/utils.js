// Shared helpers for the worker / incharge app — ported from the Expo app's
// utils (date.ts, roles.ts, avatar.ts) so both apps format things alike.

// ---- roles ----
export const WORKER_APP_ROLES = ['worker', 'incharge', 'supervisor'];
export const isInchargeRole = (role) => role === 'incharge' || role === 'supervisor';
export const isWorkerRole = (role) => role === 'worker';
export const homeRouteFor = (role) => (isInchargeRole(role) ? '/incharge' : '/home');
export const roleLabel = (role) => (role === 'supervisor' ? 'Supervisor' : role === 'incharge' ? 'Incharge' : 'Worker');

// ---- dates ----
const pad = (n) => String(n).padStart(2, '0');

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A local-midnight Date for "YYYY-MM-DD" (new Date('YYYY-MM-DD') would parse
// it as UTC midnight instead).
export function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Poll.date is a calendar date the API sends as UTC midnight
// ("2026-10-05T00:00:00.000Z"). Its first 10 characters are that calendar
// day in every timezone; converting through a local Date first would move it
// a day back anywhere west of UTC.
export function pollDateKey(dateStr) {
  return String(dateStr).slice(0, 10);
}
export function pollDate(dateStr) {
  return parseDateKey(pollDateKey(dateStr));
}

export function formatDisplayDate(date) {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// "Wed, 23 Sep" — the compact date used on the poll hero card.
export function formatShortDate(date) {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDisplayTime(date) {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDisplayDateTime(dateStr) {
  const d = new Date(dateStr);
  return `${formatDisplayDate(d)} · ${formatDisplayTime(d)}`;
}

export function formatHHMM(hhmm) {
  if (!hhmm) return '-';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return formatDisplayTime(d);
}

export function formatShiftLabel(start, end) {
  if (!start || !end) return 'Shift not set';
  return `${formatHHMM(start)} – ${formatHHMM(end)}`;
}

// Poll.shift holds the full label, e.g. "Shift A · 8:00 AM – 4:00 PM"
// (backend formatShiftName). Where the times are shown separately, only the
// name part is wanted.
export function shiftName(shift) {
  return String(shift || '').split(' · ')[0] || 'Shift';
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function greetingFor(date = new Date()) {
  const hr = date.getHours();
  return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

export const firstName = (name) => (name || '').split(' ')[0] || 'there';

// ---- avatar ----
export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// One of three tints, picked by the numeric part of the employee ID — same
// rule as the Expo app, so a person has the same colour in both.
export function avatarTintIndex(employeeId) {
  const n = parseInt(String(employeeId || '').replace(/\D/g, ''), 10) || 0;
  return n % 3;
}

// ---- CSV export (incharge poll report) ----
function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const statusLabel = (status) => (status === 'coming' ? 'Coming' : status === 'not_coming' ? 'Not Coming' : 'No Response');

// Same columns and summary block as the Expo app's export, downloaded as a
// file instead of shared through the phone's share sheet. Starts with a BOM
// so Excel opens it as UTF-8 (names with non-ASCII characters stay intact).
export function downloadPollReportCsv(poll, summary) {
  const roster = summary.teamRoster ?? [];
  const headers = [
    'Employee ID', 'Employee Name', 'Department', 'Department Code', 'Poll Title', 'Shift', 'Poll Date',
    'Opens At', 'Closes At', 'Poll Status', 'Response Status', 'Answer', 'Responded At', 'Created By',
  ];
  const rows = roster.map((member) => [
    member.employeeId,
    member.name,
    poll.department?.name ?? '',
    poll.department?.code ?? '',
    poll.title,
    poll.shift,
    formatDisplayDate(pollDate(poll.date)),
    formatDisplayDateTime(poll.opensAt),
    poll.closesAt ? formatDisplayDateTime(poll.closesAt) : '',
    String(poll.status).toUpperCase(),
    statusLabel(member.status),
    member.answer ? (member.answer === 'yes' ? 'Coming' : 'Not Coming') : '',
    member.answeredAt ? formatDisplayDateTime(member.answeredAt) : '',
    poll.createdBy ? `${poll.createdBy.name} (${poll.createdBy.employeeId})` : 'Automatic',
  ]);
  const total = summary.totalWorkers ?? roster.length;
  const summaryRows = [
    [],
    ['Summary'],
    ['Total Workers', total],
    ['Responded', summary.totalResponses],
    ['Coming', summary.coming],
    ['Not Coming', summary.notComing],
    ['No Response', summary.pending ?? 0],
    ['Response Rate %', total ? Math.round((summary.totalResponses / total) * 100) : 0],
    ['Attendance Rate %', total ? Math.round((summary.coming / total) * 100) : 0],
  ];

  const csv = [headers, ...rows, ...summaryRows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const safeTitle = String(poll.title).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const filename = `FlexiTrack_${safeTitle}_${String(poll.id).slice(-6)}.csv`;

  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
