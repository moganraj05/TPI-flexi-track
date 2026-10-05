const crypto = require('node:crypto');
const prisma = require('../config/prisma');
const { getStartOfDay } = require('../utils/date');
const {
  isValidShiftTime,
  getPollWindow,
} = require('../utils/shift');
const { formatShiftName } = require('../config/shiftCatalog');
const { notifyShiftWorkers } = require('./notification.service');
const { emitPollUpdate } = require('../realtime');
const logger = require('../utils/logger');

const openDelayMinutes = () => Number(process.env.POLL_OPEN_AFTER_SHIFT_MINUTES) || 30;
// Poll closes 1h before the shift's next occurrence starts by default (was
// 2h) — tighter turnaround on attendance confirmation. Both catalog shift
// families (8h general A/B/C, 12h contract D/E) have well over an hour of
// slack against openDelayMinutes+closeBeforeHours, so this stays valid for
// every shift; see backend/src/utils/shift.js's getPollWindow.
const closeBeforeHours = () => Number(process.env.POLL_CLOSE_BEFORE_NEXT_SHIFT_HOURS) || 1;
// Catch-up for a missed window: the poll is only ever created by this
// in-process ticker, so if the backend was down for a shift's whole
// [opensAt, closesAt) window that day's poll was silently never created. When
// the server comes back after closesAt but before the shift actually starts,
// the poll is still created — opened immediately and kept open for this many
// minutes (capped at the shift start) so workers still get to answer.
const lateAnswerMinutes = () => Number(process.env.POLL_LATE_ANSWER_MINUTES) || 30;
// Below this much time left before the shift starts, a late poll isn't worth
// sending — nobody can realistically answer it.
const LATE_MIN_ANSWER_MS = 5 * 60 * 1000;

const matchingWorkersWhere = (departmentId, shiftStart, shiftEnd) => ({
  departmentId,
  role: 'worker',
  isActive: true,
  shiftStart,
  shiftEnd,
});

const formatNextShift = (date) =>
  date.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

async function ensureShiftPoll({ departmentId, shiftStart, shiftEnd, now = new Date() }) {
  if (!isValidShiftTime(shiftStart) || !isValidShiftTime(shiftEnd) || shiftStart === shiftEnd) {
    return null;
  }

  const window = getPollWindow(now, shiftStart, shiftEnd, {
    openDelayMinutes: openDelayMinutes(),
    closeBeforeHours: closeBeforeHours(),
  });

  if (!window.valid) return null;
  if (now < window.opensAt || now >= window.nextStart) return null;

  // Past the normal close but before the shift starts: only a catch-up
  // candidate (see lateAnswerMinutes) — decided after the existing-poll check
  // below, since a poll that opened and closed on time also lands here.
  const isLate = now >= window.closesAt;
  let opensAt = window.opensAt;
  let closesAt = window.closesAt;
  if (isLate) {
    opensAt = now;
    closesAt = new Date(Math.min(window.nextStart.getTime(), now.getTime() + lateAnswerMinutes() * 60 * 1000));
    if (closesAt.getTime() - now.getTime() < LATE_MIN_ANSWER_MS) return null;
  }

  const pollDate = getStartOfDay(window.nextStart);

  const existing = await prisma.poll.findFirst({
    where: { departmentId, shiftStart, shiftEnd, date: pollDate },
  });

  if (existing) return existing;

  const workerCount = await prisma.user.count({ where: matchingWorkersWhere(departmentId, shiftStart, shiftEnd) });
  if (workerCount === 0) return null;

  const shiftLabel = formatShiftName(shiftStart, shiftEnd);

  try {
    const poll = await prisma.poll.create({
      data: {
        title: `Next shift attendance (${shiftLabel})`,
        description: `Confirm if you are coming for your next shift starting ${formatNextShift(window.nextStart)}.`,
        departmentId,
        date: pollDate,
        shift: shiftLabel,
        shiftStart,
        shiftEnd,
        status: 'open',
        opensAt,
        closesAt,
        autoCreated: true,
        sendReminder: true,
        reminderMinutesBefore: 30,
      },
    });

    const populated = await prisma.poll.findUnique({ where: { id: poll.id }, include: { department: true } });
    const deptName = populated.department?.name || 'Your department';

    // The poll already exists at this point, so a notification failure must
    // not escape: it would abort processAllShiftPolls' loop and delay every
    // other shift group's poll to a later tick. The senders themselves don't
    // throw on push-service errors; this also covers a database error while
    // looking up recipients.
    try {
      await notifyShiftWorkers(departmentId, shiftStart, shiftEnd, {
        title: 'Attendance Poll Open',
        body: `${deptName}: Confirm Yes or No for your next ${shiftLabel} shift.`,
        data: { pollId: poll.id, type: 'poll_created' },
        url: '/home',
        tag: `poll-${poll.id}`,
        ttlSeconds: Math.max(60, Math.floor((closesAt.getTime() - Date.now()) / 1000)),
      });
    } catch (notifyError) {
      logger.error('push.poll_created_notify_failed', { pollId: poll.id, error: notifyError.message });
    }

    logger.info('poll.auto_created', {
      pollId: poll.id,
      departmentId,
      shiftLabel,
      closesAt: closesAt.toISOString(),
      late: isLate,
    });

    emitPollUpdate({ pollId: poll.id, departmentId, type: 'created' });

    return poll;
  } catch (error) {
    if (error.code === 'P2002') {
      return prisma.poll.findFirst({ where: { departmentId, shiftStart, shiftEnd, date: pollDate } });
    }
    throw error;
  }
}

async function processAllShiftPolls(now = new Date()) {
  const workers = await prisma.user.findMany({
    where: {
      role: 'worker',
      isActive: true,
      NOT: [{ shiftStart: null }, { shiftStart: '' }, { shiftEnd: null }, { shiftEnd: '' }],
    },
    select: { departmentId: true, shiftStart: true, shiftEnd: true },
  });

  const groups = new Map();
  for (const worker of workers) {
    if (!isValidShiftTime(worker.shiftStart) || !isValidShiftTime(worker.shiftEnd)) continue;
    const key = `${worker.departmentId}|${worker.shiftStart}|${worker.shiftEnd}`;
    if (!groups.has(key)) {
      groups.set(key, {
        departmentId: worker.departmentId,
        shiftStart: worker.shiftStart,
        shiftEnd: worker.shiftEnd,
      });
    }
  }

  let created = 0;
  for (const group of groups.values()) {
    const poll = await ensureShiftPoll({ ...group, now });
    if (poll) created += 1;
  }

  return { groupsConsidered: groups.size, created };
}

async function ensurePollsForWorker(worker, now = new Date()) {
  const departmentId = worker.departmentId;
  if (!worker.shiftStart || !worker.shiftEnd) return null;
  return ensureShiftPoll({
    departmentId,
    shiftStart: worker.shiftStart,
    shiftEnd: worker.shiftEnd,
    now,
  });
}

async function ensurePollsForDepartment(departmentId, now = new Date()) {
  const workers = await prisma.user.findMany({
    where: { departmentId, role: 'worker', isActive: true },
    select: { shiftStart: true, shiftEnd: true },
  });

  const seen = new Set();
  for (const worker of workers) {
    const key = `${worker.shiftStart}|${worker.shiftEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ensureShiftPoll({
      departmentId,
      shiftStart: worker.shiftStart,
      shiftEnd: worker.shiftEnd,
      now,
    });
  }
}

const startPollAutomation = (intervalMs = 60 * 1000) => {
  // A tick's own DB work (counting workers per shift, per-department
  // findFirst-then-create, sending push notifications) can occasionally run
  // longer than intervalMs, especially under load — without this guard,
  // setInterval would start a second, fully overlapping run on top of the
  // first. ensureShiftPoll's unique-constraint fallback already makes a
  // literal duplicate poll impossible even if that happened, but overlap
  // still means doubled DB/API load and log noise for the same window, so
  // it's worth actually preventing rather than just tolerating.
  let running = false;
  let inFlight = Promise.resolve();
  let stopped = false;

  const runTick = () => {
    if (stopped) return;

    if (running) {
      logger.warn('poll.automation_tick_skipped', { reason: 'previous_tick_still_running' });
      return;
    }

    running = true;
    // Each tick gets its own correlation ID (job:auto-poll:<uuid>) — so if
    // this run's processAllShiftPolls creates/closes polls, every poll.update
    // log from that run traces back to the same id, the same way a request's
    // logs all share one requestId.
    inFlight = logger.runWithContext({ requestId: `job:auto-poll:${crypto.randomUUID()}` }, async () => {
      const startedAt = Date.now();
      logger.info('poll.automation_tick_started', {});
      try {
        const result = await processAllShiftPolls();
        logger.info('poll.automation_tick_succeeded', {
          ...result,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        logger.error('poll.automation_tick_failed', {
          error: err.message,
          stack: err.stack,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        running = false;
      }
    });
  };

  runTick();
  const timer = setInterval(runTick, intervalMs);
  logger.info('poll.automation_started', { intervalMs });

  return {
    // Stops scheduling new ticks immediately (synchronously) and returns a
    // promise that resolves once whatever tick is currently in flight (if
    // any) has finished — so a caller (server shutdown) can be sure no work
    // is left running before it disconnects Prisma.
    stop: () => {
      stopped = true;
      clearInterval(timer);
      logger.info('poll.automation_stopped', {});
      return inFlight;
    },
  };
};

module.exports = {
  ensureShiftPoll,
  processAllShiftPolls,
  ensurePollsForWorker,
  ensurePollsForDepartment,
  startPollAutomation,
};
