const crypto = require('node:crypto');
const prisma = require('../config/prisma');
const { sendPushNotifications } = require('./notification.service');
const { autoCloseExpiredPolls } = require('../utils/poll');
const logger = require('../utils/logger');

const DEFAULT_REMINDER_MINUTES = 30;

const matchingShift = (poll) => {
  if (poll.shiftStart && poll.shiftEnd) {
    return { shiftStart: poll.shiftStart, shiftEnd: poll.shiftEnd };
  }
  return {};
};

const getPendingWorkersWithTokens = async (pollId, departmentId, poll) => {
  const responded = await prisma.response.findMany({ where: { pollId }, select: { userId: true } });
  const respondedUserIds = responded.map((r) => r.userId);
  return prisma.user.findMany({
    where: {
      departmentId,
      role: 'worker',
      isActive: true,
      ...matchingShift(poll),
      id: { notIn: respondedUserIds },
      NOT: [{ pushToken: null }, { pushToken: '' }],
    },
    select: { pushToken: true, name: true, employeeId: true },
  });
};

const sendPollReminder = async (poll) => {
  const deptId = poll.departmentId;
  const deptName = poll.department?.name || 'Your department';
  const minutesBefore = poll.reminderMinutesBefore || DEFAULT_REMINDER_MINUTES;

  const pendingWorkers = await getPendingWorkersWithTokens(poll.id, deptId, poll);
  const tokens = pendingWorkers.map((w) => w.pushToken);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, targeted: 0 };
  }

  const result = await sendPushNotifications(tokens, {
    title: 'Attendance Reminder',
    body: `${deptName}: "${poll.title}" closes in ${minutesBefore} minutes. Please respond Yes or No.`,
    data: { pollId: poll.id, type: 'poll_reminder' },
  });

  return { ...result, targeted: pendingWorkers.length };
};

const processPollReminders = async () => {
  const now = new Date();
  await autoCloseExpiredPolls();

  const openPolls = await prisma.poll.findMany({
    where: {
      status: 'open',
      sendReminder: true,
      reminderSentAt: null,
      opensAt: { lte: now },
      closesAt: { gt: now },
    },
    include: { department: true },
  });

  let processed = 0;
  let skippedNotDue = 0;
  let skippedAlreadyClaimed = 0;

  for (const poll of openPolls) {
    const minutesBefore = poll.reminderMinutesBefore || DEFAULT_REMINDER_MINUTES;
    const remindAt = new Date(poll.closesAt).getTime() - minutesBefore * 60 * 1000;

    if (now.getTime() < remindAt) {
      skippedNotDue += 1;
      continue;
    }

    // Atomic claim: only succeeds if no other scheduler tick already claimed
    // this poll (reminderSentAt still null), preventing a duplicate send.
    const claimed = await prisma.poll.updateMany({
      where: { id: poll.id, reminderSentAt: null, status: 'open' },
      data: { reminderSentAt: now },
    });

    if (claimed.count === 0) {
      skippedAlreadyClaimed += 1;
      continue;
    }

    const claimedPoll = await prisma.poll.findUnique({ where: { id: poll.id }, include: { department: true } });

    try {
      const result = await sendPollReminder(claimedPoll);
      processed += 1;
      logger.info('reminder.sent', {
        pollId: claimedPoll.id,
        sent: result.sent,
        targeted: result.targeted,
        failed: result.failed,
      });
    } catch (error) {
      logger.error('reminder.failed', { pollId: claimedPoll.id, error: error.message, stack: error.stack });
      await prisma.poll.update({ where: { id: claimedPoll.id }, data: { reminderSentAt: null } });
    }
  }

  return { openPollsConsidered: openPolls.length, processed, skippedNotDue, skippedAlreadyClaimed };
};

const startReminderScheduler = (intervalMs = 5 * 60 * 1000) => {
  // Same overlap guard as poll-automation.service.js: processPollReminders
  // both auto-closes expired polls and sends push notifications, either of
  // which can occasionally outlast intervalMs — without this, a slow tick
  // and the next scheduled one would run concurrently. The atomic
  // reminderSentAt claim already makes a duplicate *send* impossible even
  // then, but overlap still means doubled DB reads and log noise.
  let running = false;
  let inFlight = Promise.resolve();
  let stopped = false;

  const runTick = () => {
    if (stopped) return;

    if (running) {
      logger.warn('reminder.tick_skipped', { reason: 'previous_tick_still_running' });
      return;
    }

    running = true;
    inFlight = logger.runWithContext({ requestId: `job:reminder:${crypto.randomUUID()}` }, async () => {
      const startedAt = Date.now();
      logger.info('reminder.tick_started', {});
      try {
        const result = await processPollReminders();
        logger.info('reminder.tick_succeeded', { ...result, durationMs: Date.now() - startedAt });
      } catch (err) {
        logger.error('reminder.tick_failed', {
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
  logger.info('reminder.scheduler_started', { intervalMs });

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      logger.info('reminder.scheduler_stopped', {});
      return inFlight;
    },
  };
};

module.exports = { processPollReminders, sendPollReminder, startReminderScheduler };
