const Poll = require('../models/Poll');
const Response = require('../models/Response');
const User = require('../models/User');
const { getStartOfDay } = require('../utils/date');
const {
  isValidShiftTime,
  getPollWindow,
  formatShiftLabel,
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
} = require('../utils/shift');
const { notifyShiftWorkers } = require('./notification.service');

const openDelayMinutes = () => Number(process.env.POLL_OPEN_AFTER_SHIFT_MINUTES) || 30;
const closeBeforeHours = () => Number(process.env.POLL_CLOSE_BEFORE_NEXT_SHIFT_HOURS) || 2;

const matchingWorkersQuery = (departmentId, shiftStart, shiftEnd) => ({
  department: departmentId,
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

async function migrateManualPollsAndShifts() {
  try {
    await Poll.collection.dropIndex('uniq_shift_poll');
  } catch {
    // Index may not exist yet.
  }

  const oldPolls = await Poll.find({
    $or: [{ autoCreated: { $ne: true } }, { shiftStart: { $in: [null, ''] } }, { shiftStart: { $exists: false } }],
  }).select('_id');
  const ids = oldPolls.map((p) => p._id);
  if (ids.length) {
    await Response.deleteMany({ poll: { $in: ids } });
    await Poll.deleteMany({ _id: { $in: ids } });
    console.log(`[migrate] Removed ${ids.length} old poll(s)`);
  }

  const shiftResult = await User.updateMany(
    {
      role: 'worker',
      $or: [
        { shiftStart: { $exists: false } },
        { shiftStart: null },
        { shiftStart: '' },
        { shiftEnd: { $exists: false } },
        { shiftEnd: null },
        { shiftEnd: '' },
      ],
    },
    { $set: { shiftStart: DEFAULT_SHIFT_START, shiftEnd: DEFAULT_SHIFT_END } }
  );

  if (shiftResult.modifiedCount) {
    console.log(`[migrate] Set default 08:00–20:00 shift on ${shiftResult.modifiedCount} worker(s)`);
  }
}

async function ensureShiftPoll({ departmentId, shiftStart, shiftEnd, now = new Date() }) {
  if (!isValidShiftTime(shiftStart) || !isValidShiftTime(shiftEnd) || shiftStart === shiftEnd) {
    return null;
  }

  const window = getPollWindow(now, shiftStart, shiftEnd, {
    openDelayMinutes: openDelayMinutes(),
    closeBeforeHours: closeBeforeHours(),
  });

  if (!window.valid) return null;
  if (now < window.opensAt || now >= window.closesAt) return null;

  const workerCount = await User.countDocuments(matchingWorkersQuery(departmentId, shiftStart, shiftEnd));
  if (workerCount === 0) return null;

  const pollDate = getStartOfDay(window.nextStart);
  const shiftLabel = formatShiftLabel(shiftStart, shiftEnd);

  const existing = await Poll.findOne({
    department: departmentId,
    shiftStart,
    shiftEnd,
    date: pollDate,
  });

  if (existing) return existing;

  try {
    const poll = await Poll.create({
      title: `Next shift attendance (${shiftLabel})`,
      description: `Confirm if you are coming for your next shift starting ${formatNextShift(window.nextStart)}.`,
      department: departmentId,
      date: pollDate,
      shift: shiftLabel,
      shiftStart,
      shiftEnd,
      status: 'open',
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      autoCreated: true,
      sendReminder: true,
      reminderMinutesBefore: 30,
    });

    const populated = await Poll.findById(poll._id).populate('department', 'name code');
    const deptName = populated.department?.name || 'Your department';

    await notifyShiftWorkers(departmentId, shiftStart, shiftEnd, {
      title: 'Attendance Poll Open',
      body: `${deptName}: Confirm Yes or No for your next ${shiftLabel} shift.`,
      data: { pollId: poll._id.toString(), type: 'poll_created' },
    });

    console.log(
      `[auto-poll] Created ${shiftLabel} poll for dept ${departmentId} (closes ${window.closesAt.toISOString()})`
    );

    return poll;
  } catch (error) {
    if (error.code === 11000) {
      return Poll.findOne({ department: departmentId, shiftStart, shiftEnd, date: pollDate });
    }
    throw error;
  }
}

async function processAllShiftPolls(now = new Date()) {
  const workers = await User.find({
    role: 'worker',
    isActive: true,
    shiftStart: { $exists: true, $nin: [null, ''] },
    shiftEnd: { $exists: true, $nin: [null, ''] },
  }).select('department shiftStart shiftEnd');

  const groups = new Map();
  for (const worker of workers) {
    if (!isValidShiftTime(worker.shiftStart) || !isValidShiftTime(worker.shiftEnd)) continue;
    const deptId = (worker.department._id || worker.department).toString();
    const key = `${deptId}|${worker.shiftStart}|${worker.shiftEnd}`;
    if (!groups.has(key)) {
      groups.set(key, {
        departmentId: worker.department._id || worker.department,
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

  return created;
}

async function ensurePollsForWorker(worker, now = new Date()) {
  const departmentId = worker.department._id || worker.department;
  if (!worker.shiftStart || !worker.shiftEnd) return null;
  return ensureShiftPoll({
    departmentId,
    shiftStart: worker.shiftStart,
    shiftEnd: worker.shiftEnd,
    now,
  });
}

async function ensurePollsForDepartment(departmentId, now = new Date()) {
  const workers = await User.find({
    department: departmentId,
    role: 'worker',
    isActive: true,
  }).select('shiftStart shiftEnd');

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
  const run = () => {
    processAllShiftPolls().catch((err) => {
      console.error('[auto-poll] Scheduler error:', err.message);
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  console.log(`[auto-poll] Scheduler started (every ${intervalMs / 1000}s)`);
  return timer;
};

module.exports = {
  migrateManualPollsAndShifts,
  ensureShiftPoll,
  processAllShiftPolls,
  ensurePollsForWorker,
  ensurePollsForDepartment,
  startPollAutomation,
};
