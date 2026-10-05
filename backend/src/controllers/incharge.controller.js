const prisma = require('../config/prisma');
const { autoCloseExpiredPolls } = require('../utils/poll');
const { hashPassword } = require('../utils/password');
const { formatDept, getPollSummary, summarizePolls } = require('../utils/pollReport');
const { notificationChannelSelect, hasNotificationChannel } = require('../services/notification.service');
const { notifyPollClosed } = require('../services/poll-notifications.service');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { emitPollUpdate } = require('../realtime');
const { DEFAULT_SHIFT_START, DEFAULT_SHIFT_END } = require('../utils/shift');
const { resolveShift, formatShiftName } = require('../config/shiftCatalog');

const pollInclude = {
  department: true,
  createdBy: { select: { id: true, name: true, employeeId: true } },
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

const formatTeamWorker = (worker, livePoll = null, liveAnswer = null) => ({
  id: worker.id,
  name: worker.name,
  employeeId: worker.employeeId,
  phone: worker.phone || '',
  shiftStart: worker.shiftStart || DEFAULT_SHIFT_START,
  shiftEnd: worker.shiftEnd || DEFAULT_SHIFT_END,
  shiftLabel: formatShiftName(
    worker.shiftStart || DEFAULT_SHIFT_START,
    worker.shiftEnd || DEFAULT_SHIFT_END
  ),
  // Reachable on at least one channel: the Android APK or a browser.
  hasNotifications: hasNotificationChannel(worker),
  livePoll: livePoll
    ? {
        id: livePoll.id,
        title: livePoll.title,
        status: livePoll.status,
        opensAt: livePoll.opensAt,
        closesAt: livePoll.closesAt,
        answer: liveAnswer,
      }
    : null,
});

const getDeptId = (user) => user.departmentId;

// A 'supervisor' ("Overall Incharge") oversees every worker in their plant,
// not just people whose inchargeId happens to point at them directly —
// unlike a shift 'incharge' ("Shift Incharge"), who only manages their own
// direct reports. Without this, a supervisor with zero direct reports (the
// normal case — workers report to a shift incharge, not to them) would see
// an empty team despite genuinely overseeing the whole department.
const teamScopeFor = (user) =>
  user.role === 'supervisor' ? { departmentId: user.departmentId } : { inchargeId: user.id };

// Only the columns the callers actually read back (formatTeamWorker plus the
// shift fallbacks) — not the whole row, password hash included.
const teamWorkerSelect = {
  id: true,
  name: true,
  employeeId: true,
  phone: true,
  shiftStart: true,
  shiftEnd: true,
  ...notificationChannelSelect,
};

async function findTeamWorker(workerId, scope) {
  return prisma.user.findFirst({
    where: { id: workerId, ...scope, role: 'worker', isActive: true },
    select: teamWorkerSelect,
  });
}

exports.getMyPolls = async (req, res, next) => {
  try {
    const deptId = req.user.departmentId;
    await autoCloseExpiredPolls({ departmentId: deptId });

    // defaultLimit: 50 matches the hardcoded `take: 50` this replaces, so a
    // caller that sends neither `page` nor `limit` (any client not yet
    // updated to ask for a page) sees exactly the same first-50 it always
    // has — only a client that actually requests a page gets the rest of
    // the department's poll history it couldn't reach before.
    const pagination = parsePagination(req.query, { defaultLimit: 50 });

    const [total, polls] = await Promise.all([
      prisma.poll.count({ where: { departmentId: deptId } }),
      prisma.poll.findMany({
        where: { departmentId: deptId },
        // id tiebreaker: processAllShiftPolls can create several polls in
        // the same automation tick with identical (to the millisecond)
        // createdAt values — without a stable secondary sort, those could
        // land in a different relative order across two page fetches and
        // either skip or repeat one at the page boundary.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: pollInclude,
      }),
    ]);

    // One batched summary for the whole page (2 queries in total, rosters
    // limited to this department) instead of 2 queries per poll.
    const summaries = await summarizePolls(polls, { departmentId: deptId });
    const data = polls.map((poll) => ({ ...formatPoll(poll), summary: summaries.get(poll.id) }));

    res.json({ success: true, data, meta: buildMeta(pagination, total) });
  } catch (error) {
    next(error);
  }
};

exports.getPollDetail = async (req, res, next) => {
  try {
    const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId }, include: pollInclude });

    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found' });
    }

    const userDeptId = req.user.departmentId;
    if (poll.departmentId !== userDeptId) {
      return res.status(403).json({ success: false, message: 'This poll is not in your department' });
    }

    await autoCloseExpiredPolls({ id: poll.id });
    const refreshed = await prisma.poll.findUnique({ where: { id: poll.id }, include: pollInclude });

    const summary = await getPollSummary(refreshed, refreshed.departmentId);

    res.json({
      success: true,
      data: { poll: formatPoll(refreshed), summary },
    });
  } catch (error) {
    next(error);
  }
};

exports.closePoll = async (req, res, next) => {
  try {
    const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId } });

    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found' });
    }

    const userDeptId = req.user.departmentId;
    if (poll.departmentId !== userDeptId) {
      return res.status(403).json({ success: false, message: 'This poll is not in your department' });
    }

    // Conditional, like the scheduled auto-close: only the call that actually
    // flips open -> closed announces it, so a double tap (or a race with the
    // scheduler) can't send the closed event and notification twice.
    const { count } = await prisma.poll.updateMany({
      where: { id: poll.id, status: 'open' },
      data: { status: 'closed' },
    });

    if (count === 1) {
      emitPollUpdate({ pollId: poll.id, departmentId: poll.departmentId, type: 'closed' });
      notifyPollClosed(poll.id, { excludeUserId: req.user.id });
    }

    const populated = await prisma.poll.findUnique({ where: { id: poll.id }, include: pollInclude });

    res.json({ success: true, message: 'Poll closed', data: formatPoll(populated) });
  } catch (error) {
    next(error);
  }
};

exports.getTeamWorkers = async (req, res, next) => {
  try {
    const deptId = req.user.departmentId;

    const now = new Date();
    // Independent of each other — run concurrently instead of back-to-back
    // to pay one round-trip's latency instead of two.
    const [workers, livePolls] = await Promise.all([
      prisma.user.findMany({
        where: { ...teamScopeFor(req.user), role: 'worker', isActive: true },
        select: teamWorkerSelect,
        orderBy: { name: 'asc' },
      }),
      prisma.poll.findMany({
        where: { departmentId: deptId, status: 'open', opensAt: { lte: now }, closesAt: { gt: now } },
        select: { id: true, title: true, status: true, opensAt: true, closesAt: true, shiftStart: true, shiftEnd: true },
      }),
    ]);

    const pollByShift = new Map(livePolls.map((p) => [`${p.shiftStart}|${p.shiftEnd}`, p]));
    const livePollIds = livePolls.map((p) => p.id);
    const liveResponses = livePollIds.length
      ? await prisma.response.findMany({
          where: { pollId: { in: livePollIds } },
          select: { pollId: true, userId: true, answer: true },
        })
      : [];

    const registered = workers.filter(hasNotificationChannel).length;
    const withLivePoll = workers.filter((w) => pollByShift.has(`${w.shiftStart}|${w.shiftEnd}`)).length;

    res.json({
      success: true,
      data: workers.map((w) => {
        const livePoll = pollByShift.get(`${w.shiftStart}|${w.shiftEnd}`) || null;
        const liveAnswer = livePoll
          ? liveResponses.find((r) => r.pollId === livePoll.id && r.userId === w.id)?.answer || null
          : null;
        return formatTeamWorker(w, livePoll, liveAnswer);
      }),
      meta: {
        total: workers.length,
        withNotifications: registered,
        withoutNotifications: workers.length - registered,
        withLivePoll,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.createTeamWorker = async (req, res, next) => {
  try {
    const { employeeId, name, phone, password } = req.body;

    if (!employeeId?.trim() || !name?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, name and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const shift = resolveShift(req.body, DEFAULT_SHIFT_START, DEFAULT_SHIFT_END);
    if (shift.error) {
      return res.status(400).json({ success: false, message: shift.error });
    }

    const normalizedId = employeeId.trim().toUpperCase();
    const existing = await prisma.user.findUnique({ where: { employeeId: normalizedId } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Employee ID already exists' });
    }

    const worker = await prisma.user.create({
      data: {
        employeeId: normalizedId,
        name: name.trim(),
        phone: phone?.trim() || '',
        password: await hashPassword(password),
        role: 'worker',
        departmentId: getDeptId(req.user),
        inchargeId: req.user.id,
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        shiftName: shift.shiftName || '',
      },
      select: teamWorkerSelect,
    });

    res.status(201).json({
      success: true,
      message: 'Worker added to your team',
      data: formatTeamWorker(worker),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateTeamWorker = async (req, res, next) => {
  try {
    const worker = await findTeamWorker(req.params.workerId, teamScopeFor(req.user));

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in your team' });
    }

    const { name, phone, password } = req.body;
    const data = {};

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      data.name = name.trim();
    }

    if (phone !== undefined) {
      data.phone = phone?.trim() || '';
    }

    if (req.body.shiftCode !== undefined || req.body.shiftStart !== undefined || req.body.shiftEnd !== undefined) {
      const shift = resolveShift(
        req.body,
        worker.shiftStart || DEFAULT_SHIFT_START,
        worker.shiftEnd || DEFAULT_SHIFT_END
      );
      if (shift.error) {
        return res.status(400).json({ success: false, message: shift.error });
      }
      data.shiftStart = shift.shiftStart;
      data.shiftEnd = shift.shiftEnd;
      if (shift.shiftName) data.shiftName = shift.shiftName;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters',
        });
      }
      data.password = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id: worker.id },
      data,
      select: teamWorkerSelect,
    });

    res.json({
      success: true,
      message: 'Worker updated',
      data: formatTeamWorker(updated),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteTeamWorker = async (req, res, next) => {
  try {
    const worker = await findTeamWorker(req.params.workerId, teamScopeFor(req.user));

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in your team' });
    }

    await prisma.user.update({
      where: { id: worker.id },
      data: { isActive: false, pushToken: null, webPushSubscriptions: { deleteMany: {} } },
    });

    res.json({ success: true, message: 'Worker removed from your team' });
  } catch (error) {
    next(error);
  }
};
