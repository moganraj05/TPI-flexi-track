const Poll = require('../models/Poll');
const Response = require('../models/Response');
const User = require('../models/User');
const { autoCloseExpiredPolls } = require('../utils/poll');
const { ensurePollsForDepartment } = require('../services/poll-automation.service');
const {
  isValidShiftTime,
  formatShiftLabel,
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
} = require('../utils/shift');

const formatPoll = (poll) => ({
  id: poll._id,
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
  department: poll.department,
  createdBy: poll.createdBy
    ? { id: poll.createdBy._id, name: poll.createdBy.name, employeeId: poll.createdBy.employeeId }
    : null,
  createdAt: poll.createdAt,
});

const parseShiftTimes = (body, fallbackStart, fallbackEnd) => {
  const shiftStart = body.shiftStart !== undefined ? String(body.shiftStart).trim() : fallbackStart;
  const shiftEnd = body.shiftEnd !== undefined ? String(body.shiftEnd).trim() : fallbackEnd;

  if (!isValidShiftTime(shiftStart) || !isValidShiftTime(shiftEnd)) {
    return { error: 'Shift times must be in HH:mm format (e.g. 08:00)' };
  }
  if (shiftStart === shiftEnd) {
    return { error: 'Shift start and end cannot be the same time' };
  }
  return { shiftStart, shiftEnd };
};

const formatTeamWorker = (worker, livePoll = null, liveAnswer = null) => ({
  id: worker._id,
  name: worker.name,
  employeeId: worker.employeeId,
  phone: worker.phone || '',
  shiftStart: worker.shiftStart || DEFAULT_SHIFT_START,
  shiftEnd: worker.shiftEnd || DEFAULT_SHIFT_END,
  shiftLabel: formatShiftLabel(
    worker.shiftStart || DEFAULT_SHIFT_START,
    worker.shiftEnd || DEFAULT_SHIFT_END
  ),
  hasNotifications: !!(worker.pushToken && worker.pushToken.startsWith('ExponentPushToken[')),
  livePoll: livePoll
    ? {
        id: livePoll._id,
        title: livePoll.title,
        status: livePoll.status,
        opensAt: livePoll.opensAt,
        closesAt: livePoll.closesAt,
        answer: liveAnswer,
      }
    : null,
});

const getDeptId = (user) => user.department._id || user.department;

async function findTeamWorker(workerId, deptId) {
  return User.findOne({
    _id: workerId,
    department: deptId,
    role: 'worker',
    isActive: true,
  });
}

const getPollSummary = async (poll, departmentId) => {
  const responses = await Response.find({ poll: poll._id }).populate('user', 'name employeeId');
  const yes = responses.filter((r) => r.answer === 'yes');
  const no = responses.filter((r) => r.answer === 'no');

  const respondedUserIds = new Set(responses.map((r) => r.user._id.toString()));
  const workerFilter = {
    department: departmentId,
    role: 'worker',
    isActive: true,
  };
  if (poll.shiftStart && poll.shiftEnd) {
    workerFilter.shiftStart = poll.shiftStart;
    workerFilter.shiftEnd = poll.shiftEnd;
  }

  const allWorkers = await User.find(workerFilter).select('name employeeId');

  const pendingWorkers = allWorkers
    .filter((w) => !respondedUserIds.has(w._id.toString()))
    .map((w) => ({ id: w._id, name: w.name, employeeId: w.employeeId }));

  const totalWorkers = allWorkers.length;

  const teamRoster = allWorkers.map((w) => {
    const response = responses.find((r) => r.user._id.toString() === w._id.toString());
    if (!response) {
      return {
        id: w._id.toString(),
        name: w.name,
        employeeId: w.employeeId,
        status: 'pending',
        answer: null,
        answeredAt: null,
      };
    }
    return {
      id: w._id.toString(),
      name: w.name,
      employeeId: w.employeeId,
      status: response.answer === 'yes' ? 'coming' : 'not_coming',
      answer: response.answer,
      answeredAt: response.answeredAt,
    };
  });

  return {
    totalResponses: responses.length,
    coming: yes.length,
    notComing: no.length,
    totalWorkers,
    pending: pendingWorkers.length,
    pendingWorkers,
    teamRoster,
    responses: responses.map((r) => ({
      id: r._id,
      answer: r.answer,
      answeredAt: r.answeredAt,
      user: { id: r.user._id, name: r.user.name, employeeId: r.user.employeeId },
    })),
  };
};

exports.getMyPolls = async (req, res, next) => {
  try {
    const deptId = req.user.department._id || req.user.department;
    await autoCloseExpiredPolls({ department: deptId });
    await ensurePollsForDepartment(deptId);

    const polls = await Poll.find({
      department: deptId,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('department', 'name code')
      .populate('createdBy', 'name employeeId');

    const data = await Promise.all(
      polls.map(async (poll) => {
        const pollDeptId = poll.department._id || poll.department;
        const summary = await getPollSummary(poll, pollDeptId);
        return { ...formatPoll(poll), summary };
      })
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getPollDetail = async (req, res, next) => {
  try {
    const poll = await Poll.findById(req.params.pollId)
      .populate('department', 'name code')
      .populate('createdBy', 'name employeeId');

    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found' });
    }

    const userDeptId = (req.user.department._id || req.user.department).toString();
    const pollDeptId = (poll.department._id || poll.department).toString();
    if (pollDeptId !== userDeptId) {
      return res.status(403).json({ success: false, message: 'This poll is not in your department' });
    }

    await autoCloseExpiredPolls({ _id: poll._id });
    const refreshed = await Poll.findById(poll._id)
      .populate('department', 'name code')
      .populate('createdBy', 'name employeeId');

    const summary = await getPollSummary(refreshed, refreshed.department._id || refreshed.department);

    res.json({
      success: true,
      data: {
        poll: formatPoll(refreshed),
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.closePoll = async (req, res, next) => {
  try {
    const poll = await Poll.findById(req.params.pollId);

    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found' });
    }

    const userDeptId = (req.user.department._id || req.user.department).toString();
    const pollDeptId = (poll.department._id || poll.department).toString();
    if (pollDeptId !== userDeptId) {
      return res.status(403).json({ success: false, message: 'This poll is not in your department' });
    }

    poll.status = 'closed';
    await poll.save();

    const populated = await Poll.findById(poll._id)
      .populate('department', 'name code')
      .populate('createdBy', 'name employeeId');

    res.json({ success: true, message: 'Poll closed', data: formatPoll(populated) });
  } catch (error) {
    next(error);
  }
};

exports.getTeamWorkers = async (req, res, next) => {
  try {
    const deptId = req.user.department._id || req.user.department;
    await ensurePollsForDepartment(deptId);

    const workers = await User.find({
      department: deptId,
      role: 'worker',
      isActive: true,
    })
      .select('name employeeId phone pushToken shiftStart shiftEnd')
      .sort({ name: 1 });

    const now = new Date();
    const livePolls = await Poll.find({
      department: deptId,
      status: 'open',
      opensAt: { $lte: now },
      closesAt: { $gt: now },
    }).select('title status opensAt closesAt shiftStart shiftEnd');

    const pollByShift = new Map(
      livePolls.map((p) => [`${p.shiftStart}|${p.shiftEnd}`, p])
    );
    const livePollIds = livePolls.map((p) => p._id);
    const liveResponses = livePollIds.length
      ? await Response.find({ poll: { $in: livePollIds } }).select('poll user answer')
      : [];

    const registered = workers.filter(
      (w) => w.pushToken && w.pushToken.startsWith('ExponentPushToken[')
    ).length;
    const withLivePoll = workers.filter((w) =>
      pollByShift.has(`${w.shiftStart}|${w.shiftEnd}`)
    ).length;

    res.json({
      success: true,
      data: workers.map((w) => {
        const livePoll = pollByShift.get(`${w.shiftStart}|${w.shiftEnd}`) || null;
        const liveAnswer = livePoll
          ? liveResponses.find(
              (r) =>
                r.poll.toString() === livePoll._id.toString() &&
                r.user.toString() === w._id.toString()
            )?.answer || null
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

    const shift = parseShiftTimes(req.body, DEFAULT_SHIFT_START, DEFAULT_SHIFT_END);
    if (shift.error) {
      return res.status(400).json({ success: false, message: shift.error });
    }

    const normalizedId = employeeId.trim().toUpperCase();
    const existing = await User.findOne({ employeeId: normalizedId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Employee ID already exists' });
    }

    const worker = await User.create({
      employeeId: normalizedId,
      name: name.trim(),
      phone: phone?.trim() || '',
      password,
      role: 'worker',
      department: getDeptId(req.user),
      shiftStart: shift.shiftStart,
      shiftEnd: shift.shiftEnd,
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
    const worker = await findTeamWorker(req.params.workerId, getDeptId(req.user));

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in your team' });
    }

    const { name, phone, password } = req.body;

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      worker.name = name.trim();
    }

    if (phone !== undefined) {
      worker.phone = phone?.trim() || '';
    }

    if (req.body.shiftStart !== undefined || req.body.shiftEnd !== undefined) {
      const shift = parseShiftTimes(
        req.body,
        worker.shiftStart || DEFAULT_SHIFT_START,
        worker.shiftEnd || DEFAULT_SHIFT_END
      );
      if (shift.error) {
        return res.status(400).json({ success: false, message: shift.error });
      }
      worker.shiftStart = shift.shiftStart;
      worker.shiftEnd = shift.shiftEnd;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters',
        });
      }
      worker.password = password;
    }

    await worker.save();

    res.json({
      success: true,
      message: 'Worker updated',
      data: formatTeamWorker(worker),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteTeamWorker = async (req, res, next) => {
  try {
    const worker = await findTeamWorker(req.params.workerId, getDeptId(req.user));

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in your team' });
    }

    worker.isActive = false;
    worker.pushToken = undefined;
    await worker.save();

    res.json({ success: true, message: 'Worker removed from your team' });
  } catch (error) {
    next(error);
  }
};
