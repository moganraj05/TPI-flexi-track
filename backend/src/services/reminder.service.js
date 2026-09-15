const Poll = require('../models/Poll');
const Response = require('../models/Response');
const User = require('../models/User');
const { sendPushNotifications } = require('./notification.service');
const { autoCloseExpiredPolls } = require('../utils/poll');

const DEFAULT_REMINDER_MINUTES = 30;

const matchingShift = (poll) => {
  if (poll.shiftStart && poll.shiftEnd) {
    return { shiftStart: poll.shiftStart, shiftEnd: poll.shiftEnd };
  }
  return {};
};

const getPendingWorkersWithTokens = async (pollId, departmentId, poll) => {
  const respondedUserIds = await Response.find({ poll: pollId }).distinct('user');
  return User.find({
    department: departmentId,
    role: 'worker',
    isActive: true,
    ...matchingShift(poll),
    _id: { $nin: respondedUserIds },
    pushToken: { $exists: true, $nin: [null, ''] },
  }).select('pushToken name employeeId');
};

const sendPollReminder = async (poll) => {
  const deptId = poll.department._id || poll.department;
  const deptName = poll.department.name || 'Your department';
  const minutesBefore = poll.reminderMinutesBefore || DEFAULT_REMINDER_MINUTES;

  const pendingWorkers = await getPendingWorkersWithTokens(poll._id, deptId, poll);
  const tokens = pendingWorkers.map((w) => w.pushToken);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, targeted: 0 };
  }

  const result = await sendPushNotifications(tokens, {
    title: 'Attendance Reminder',
    body: `${deptName}: "${poll.title}" closes in ${minutesBefore} minutes. Please respond Yes or No.`,
    data: { pollId: poll._id.toString(), type: 'poll_reminder' },
  });

  return { ...result, targeted: pendingWorkers.length };
};

const processPollReminders = async () => {
  const now = new Date();
  await autoCloseExpiredPolls();

  const openPolls = await Poll.find({
    status: 'open',
    sendReminder: true,
    reminderSentAt: null,
    opensAt: { $lte: now },
    closesAt: { $gt: now },
  }).populate('department', 'name code');

  let processed = 0;

  for (const poll of openPolls) {
    const minutesBefore = poll.reminderMinutesBefore || DEFAULT_REMINDER_MINUTES;
    const remindAt = new Date(poll.closesAt).getTime() - minutesBefore * 60 * 1000;

    if (now.getTime() < remindAt) continue;

    const claimed = await Poll.findOneAndUpdate(
      { _id: poll._id, reminderSentAt: null, status: 'open' },
      { reminderSentAt: now },
      { new: true }
    ).populate('department', 'name code');

    if (!claimed) continue;

    try {
      const result = await sendPollReminder(claimed);
      processed += 1;
      console.log(
        `[reminder] "${claimed.title}" — sent ${result.sent}/${result.targeted} reminder(s)` +
          (result.failed > 0 ? `, ${result.failed} failed` : '')
      );
    } catch (error) {
      console.error(`[reminder] Failed for poll ${claimed._id}:`, error.message);
      await Poll.findByIdAndUpdate(claimed._id, { $unset: { reminderSentAt: 1 } });
    }
  }

  return processed;
};

const startReminderScheduler = (intervalMs = 5 * 60 * 1000) => {
  const run = () => {
    processPollReminders().catch((err) => {
      console.error('[reminder] Scheduler error:', err.message);
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  console.log(`[reminder] Scheduler started (every ${intervalMs / 60000} min)`);
  return timer;
};

module.exports = { processPollReminders, sendPollReminder, startReminderScheduler };
