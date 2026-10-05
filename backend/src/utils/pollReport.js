const prisma = require('../config/prisma');

const responseUserSelect = {
  id: true,
  name: true,
  employeeId: true,
  phone: true,
  shiftStart: true,
  shiftEnd: true,
};

const workerSelect = {
  id: true,
  name: true,
  employeeId: true,
  phone: true,
  departmentId: true,
  shiftStart: true,
  shiftEnd: true,
  equipment: true,
  process: true,
  incharge: { select: { id: true, name: true } },
};

const rosterFields = (w) => ({
  id: w.id,
  name: w.name,
  employeeId: w.employeeId,
  phone: w.phone || '',
  shiftStart: w.shiftStart || null,
  shiftEnd: w.shiftEnd || null,
  equipment: w.equipment || '',
  process: w.process || '',
  incharge: w.incharge ? { id: w.incharge.id, name: w.incharge.name } : null,
});

// A worker is in a given poll's roster if they're in the poll's department
// and — when the poll has explicit shift times (the normal auto-created
// case) — share that exact shift timing. Mirrors the filter that used to be
// built into each per-poll Prisma query, now applied in memory against a
// roster fetched once.
const isInPollRoster = (worker, poll) => {
  if (worker.departmentId !== poll.departmentId) return false;
  if (poll.shiftStart && poll.shiftEnd) {
    return worker.shiftStart === poll.shiftStart && worker.shiftEnd === poll.shiftEnd;
  }
  return true;
};

// Pure computation, no I/O — shared by the single-poll and batch paths below
// so both produce byte-for-byte the same shape from the same inputs.
const buildSummary = (responses, allWorkers) => {
  const yes = responses.filter((r) => r.answer === 'yes');
  const no = responses.filter((r) => r.answer === 'no');
  const respondedUserIds = new Set(responses.filter((r) => r.user).map((r) => r.user.id));

  const pendingWorkers = allWorkers.filter((w) => !respondedUserIds.has(w.id)).map((w) => rosterFields(w));

  const responseByUser = new Map(responses.filter((r) => r.user).map((r) => [r.user.id, r]));
  const teamRoster = allWorkers.map((w) => {
    const response = responseByUser.get(w.id);
    if (!response) {
      return { ...rosterFields(w), status: 'pending', answer: null, answeredAt: null };
    }
    return {
      ...rosterFields(w),
      status: response.answer === 'yes' ? 'coming' : 'not_coming',
      answer: response.answer,
      answeredAt: response.answeredAt,
    };
  });

  const totalWorkers = allWorkers.length;
  const responseRate = totalWorkers ? Math.round((responses.length / totalWorkers) * 100) : 0;
  const attendanceRate = totalWorkers ? Math.round((yes.length / totalWorkers) * 100) : 0;

  return {
    totalResponses: responses.length,
    coming: yes.length,
    notComing: no.length,
    totalWorkers,
    pending: pendingWorkers.length,
    pendingWorkers,
    teamRoster,
    responseRate,
    attendanceRate,
    responses: responses
      .filter((r) => r.user)
      .map((r) => ({
        id: r.id,
        answer: r.answer,
        answeredAt: r.answeredAt,
        user: {
          id: r.user.id,
          name: r.user.name,
          employeeId: r.user.employeeId,
          phone: r.user.phone || '',
        },
      })),
  };
};

// Single-poll summary — unchanged cost (2 queries: this poll's responses,
// this poll's department+shift roster). Used by the detail/export/attendance
// screens that only ever look at one poll at a time.
const getPollSummary = async (poll, departmentId) => {
  const workerFilter = { departmentId, role: 'worker', isActive: true };
  if (poll.shiftStart && poll.shiftEnd) {
    workerFilter.shiftStart = poll.shiftStart;
    workerFilter.shiftEnd = poll.shiftEnd;
  }

  const [responses, allWorkers] = await Promise.all([
    prisma.response.findMany({ where: { pollId: poll.id }, include: { user: { select: responseUserSelect } } }),
    prisma.user.findMany({ where: workerFilter, select: workerSelect }),
  ]);

  return buildSummary(responses, allWorkers);
};

// Batch summary for a whole poll list (dashboard, live board, poll listing,
// manpower export, follow-ups) — exactly 2 queries total no matter how many
// polls are being summarized, instead of 2 per poll. That matters twice
// over here: it avoids flooding the (deliberately small, PgBouncer-backed)
// Postgres connection pool with dozens of parallel query pairs, and it's a
// straight latency win since summary output is identical either way.
// Pass { departmentId } when every poll is from one department (the incharge
// app) so only that department's roster is loaded, not the whole company's.
const summarizePolls = async (polls, { departmentId } = {}) => {
  const result = new Map();
  if (polls.length === 0) return result;

  const pollIds = polls.map((p) => p.id);
  const [allResponses, allWorkers] = await Promise.all([
    prisma.response.findMany({
      where: { pollId: { in: pollIds } },
      include: { user: { select: responseUserSelect } },
    }),
    prisma.user.findMany({
      where: { role: 'worker', isActive: true, ...(departmentId ? { departmentId } : {}) },
      select: workerSelect,
    }),
  ]);

  const responsesByPoll = new Map();
  for (const response of allResponses) {
    const list = responsesByPoll.get(response.pollId);
    if (list) list.push(response);
    else responsesByPoll.set(response.pollId, [response]);
  }

  for (const poll of polls) {
    const pollResponses = responsesByPoll.get(poll.id) || [];
    const pollWorkers = allWorkers.filter((w) => isInPollRoster(w, poll));
    result.set(poll.id, buildSummary(pollResponses, pollWorkers));
  }

  return result;
};

// Counts-only variant of the batch summary, for list screens that render
// numbers (Attendance, Reports) and never touch teamRoster/pendingWorkers/
// responses. Same 2 queries as summarizePolls, but each row carries 3-4
// small columns instead of names/phones/equipment plus an incharge join —
// and the arrays are never built, so the HTTP payload drops from "every
// roster for every poll on the page" to a handful of integers per poll.
// Numbers are computed with the identical rules as buildSummary so the two
// paths can't drift.
const summarizePollCounts = async (polls) => {
  const result = new Map();
  if (polls.length === 0) return result;

  const pollIds = polls.map((p) => p.id);
  const [allResponses, allWorkers] = await Promise.all([
    prisma.response.findMany({
      where: { pollId: { in: pollIds } },
      select: { pollId: true, userId: true, answer: true },
    }),
    prisma.user.findMany({
      where: { role: 'worker', isActive: true },
      select: { id: true, departmentId: true, shiftStart: true, shiftEnd: true },
    }),
  ]);

  const responsesByPoll = new Map();
  for (const response of allResponses) {
    const list = responsesByPoll.get(response.pollId);
    if (list) list.push(response);
    else responsesByPoll.set(response.pollId, [response]);
  }

  for (const poll of polls) {
    const responses = responsesByPoll.get(poll.id) || [];
    const workers = allWorkers.filter((w) => isInPollRoster(w, poll));

    const coming = responses.filter((r) => r.answer === 'yes').length;
    const notComing = responses.filter((r) => r.answer === 'no').length;
    const respondedUserIds = new Set(responses.map((r) => r.userId));
    const pending = workers.filter((w) => !respondedUserIds.has(w.id)).length;
    const totalWorkers = workers.length;

    result.set(poll.id, {
      totalResponses: responses.length,
      coming,
      notComing,
      totalWorkers,
      pending,
      responseRate: totalWorkers ? Math.round((responses.length / totalWorkers) * 100) : 0,
      attendanceRate: totalWorkers ? Math.round((coming / totalWorkers) * 100) : 0,
    });
  }

  return result;
};

const formatDept = (dept) => {
  if (!dept) return null;
  const id = dept.id || dept._id || dept;
  return { _id: id, id, name: dept.name || '', code: dept.code || '', isActive: dept.isActive !== false };
};

const formatPoll = (poll) => ({
  id: poll.id,
  title: poll.title,
  description: poll.description,
  date: poll.date,
  shift: poll.shift,
  shiftStart: poll.shiftStart || null,
  shiftEnd: poll.shiftEnd || null,
  status: poll.status,
  opensAt: poll.opensAt,
  closesAt: poll.closesAt,
  sendReminder: poll.sendReminder !== false,
  reminderMinutesBefore: poll.reminderMinutesBefore ?? 30,
  reminderSentAt: poll.reminderSentAt ?? null,
  autoCreated: poll.autoCreated !== false,
  department: formatDept(poll.department),
  createdBy: poll.createdBy
    ? { id: poll.createdBy.id, name: poll.createdBy.name, employeeId: poll.createdBy.employeeId }
    : null,
  createdAt: poll.createdAt,
});

module.exports = { getPollSummary, summarizePolls, summarizePollCounts, formatPoll, formatDept };
