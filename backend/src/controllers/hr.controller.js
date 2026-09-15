const jwt = require('jsonwebtoken');
const Poll = require('../models/Poll');
const Response = require('../models/Response');
const User = require('../models/User');
const Department = require('../models/Department');
const { autoCloseExpiredPolls } = require('../utils/poll');
const { getPollSummary, formatPoll, formatDept } = require('../utils/pollReport');
const FollowUp = require('../models/FollowUp');
const { buildPollExcelBuffer, buildPollPdfBuffer, buildRangeExcelBuffer } = require('../services/hr-export.service');

const HR_ROLES = ['hr', 'admin', 'superadmin'];

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '365d',
  });

const formatHrUser = (user) => ({
  id: String(user._id),
  employeeId: user.employeeId,
  name: user.name,
  email: user.email || null,
  phone: user.phone || '',
  role: user.role,
});

const idOf = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const formatIncharge = (inc) => {
  if (!inc) return null;
  return {
    id: idOf(inc),
    name: inc.name,
    employeeId: inc.employeeId,
    shiftStart: inc.shiftStart || null,
    shiftEnd: inc.shiftEnd || null,
    shiftName: inc.shiftName || '',
  };
};

const formatWorker = (w) => ({
  id: idOf(w),
  name: w.name,
  employeeId: w.employeeId,
  email: w.email || '',
  phone: w.phone || '',
  role: w.role,
  department: formatDept(w.department),
  incharge: w.incharge && w.incharge._id ? formatIncharge(w.incharge) : null,
  equipment: w.equipment || '',
  process: w.process || '',
  shiftStart: w.shiftStart || null,
  shiftEnd: w.shiftEnd || null,
  shiftName: w.shiftName || '',
  isActive: w.isActive !== false,
  hasNotifications: !!(w.pushToken && String(w.pushToken).startsWith('ExponentPushToken[')),
});

const summarizeLivePolls = async (polls) =>
  Promise.all(
    polls
      .filter((poll) => poll.department)
      .map(async (poll) => {
        const summary = await getPollSummary(poll, poll.department._id || poll.department);
        return { ...formatPoll(poll), department: formatDept(poll.department), summary };
      })
  );

const departmentStats = (dept, workers, incharges, live) => {
  const did = idOf(dept);
  const deptLive = live.filter((p) => idOf(p.department) === did);
  return {
    id: did,
    name: dept.name,
    code: dept.code,
    isActive: dept.isActive !== false,
    workers: workers.filter((w) => idOf(w.department) === did).length,
    incharges: incharges.filter((i) => idOf(i.department) === did).length,
    livePolls: deptLive.length,
    coming: deptLive.reduce((n, p) => n + (p.summary?.coming || 0), 0),
    notComing: deptLive.reduce((n, p) => n + (p.summary?.notComing || 0), 0),
    pending: deptLive.reduce((n, p) => n + (p.summary?.pending || 0), 0),
  };
};

const loadPollOr404 = async (pollId, res) => {
  const poll = await Poll.findById(pollId)
    .populate('department', 'name code')
    .populate('createdBy', 'name employeeId');
  if (!poll) {
    res.status(404).json({ success: false, message: 'Poll not found' });
    return null;
  }
  await autoCloseExpiredPolls({ _id: poll._id });
  return Poll.findById(poll._id).populate('department', 'name code').populate('createdBy', 'name employeeId');
};

exports.login = async (req, res, next) => {
  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password').populate('department', 'name code');
    if (!user || !user.isActive || !HR_ROLES.includes(user.role)) {
      return res.status(401).json({ success: false, message: 'Invalid HR credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid HR credentials' });
    }

    const token = signToken(user._id);
    user.password = undefined;
    res.json({ success: true, data: { token, user: formatHrUser(user) } });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, data: formatHrUser(req.user) });
};

exports.getDashboard = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();

    const [departments, workers, incharges, openPolls, closedPolls] = await Promise.all([
      Department.find({ isActive: { $ne: false } }).select('name code'),
      User.find({ role: 'worker', isActive: true }).select('name employeeId department shiftStart shiftEnd phone pushToken'),
      User.find({ role: 'incharge', isActive: true }).select('name employeeId department'),
      Poll.find({ status: 'open', opensAt: { $lte: now }, closesAt: { $gt: now } })
        .populate('department', 'name code')
        .sort({ closesAt: 1 }),
      Poll.find({ status: 'closed' }).sort({ closesAt: -1 }).limit(12).populate('department', 'name code'),
    ]);

    const live = await summarizeLivePolls(openPolls);
    const recent = await summarizeLivePolls(closedPolls);

    const coming = live.reduce((n, p) => n + (p.summary?.coming || 0), 0);
    const notComing = live.reduce((n, p) => n + (p.summary?.notComing || 0), 0);
    const pending = live.reduce((n, p) => n + (p.summary?.pending || 0), 0);

    const byDepartment = departments.map((dept) => departmentStats(dept, workers, incharges, live));

    res.json({
      success: true,
      data: {
        stats: {
          departments: departments.length,
          workers: workers.length,
          incharges: incharges.length,
          livePolls: live.length,
          coming,
          notComing,
          pending,
          notified: workers.filter((w) => w.pushToken).length,
        },
        byDepartment,
        livePolls: live,
        recentClosed: recent,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPolls = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const { status, department, q } = req.query;
    const filter = {};
    if (status === 'open' || status === 'closed') filter.status = status;
    if (department) filter.department = department;
    if (q?.trim()) {
      filter.$or = [
        { title: { $regex: q.trim(), $options: 'i' } },
        { shift: { $regex: q.trim(), $options: 'i' } },
      ];
    }

    const polls = await Poll.find(filter)
      .sort({ createdAt: -1 })
      .limit(120)
      .populate('department', 'name code')
      .populate('createdBy', 'name employeeId');

    const data = [];
    for (const poll of polls) {
      if (!poll.department) continue;
      const summary = await getPollSummary(poll, poll.department._id || poll.department);
      data.push({ ...formatPoll(poll), summary });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getPollDetail = async (req, res, next) => {
  try {
    const poll = await loadPollOr404(req.params.pollId, res);
    if (!poll) return;
    const summary = await getPollSummary(poll, poll.department._id || poll.department);
    res.json({ success: true, data: { poll: formatPoll(poll), summary } });
  } catch (error) {
    next(error);
  }
};

exports.markAttendance = async (req, res, next) => {
  try {
    const { workerId, answer } = req.body;
    if (!['yes', 'no'].includes(answer)) {
      return res.status(400).json({ success: false, message: 'Answer must be yes or no' });
    }

    const poll = await loadPollOr404(req.params.pollId, res);
    if (!poll) return;

    const worker = await User.findOne({ _id: workerId, role: 'worker', isActive: true });
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    await Response.findOneAndUpdate(
      { poll: poll._id, user: worker._id },
      { answer, answeredAt: new Date() },
      { upsert: true, new: true, runValidators: true }
    );

    const summary = await getPollSummary(poll, poll.department._id || poll.department);
    res.json({
      success: true,
      message: `Marked ${worker.name} as ${answer === 'yes' ? 'coming' : 'not coming'}`,
      data: { poll: formatPoll(poll), summary },
    });
  } catch (error) {
    next(error);
  }
};

exports.getWorkforce = async (req, res, next) => {
  try {
    const filter = { role: { $in: ['worker', 'incharge'] } };
    if (req.query.active === 'false') filter.isActive = false;
    else if (req.query.active !== 'all') filter.isActive = true;

    const workers = await User.find(filter)
      .select('name employeeId email phone role department incharge equipment process shiftStart shiftEnd shiftName pushToken isActive')
      .populate('department', 'name code')
      .populate('incharge', 'name employeeId shiftStart shiftEnd shiftName')
      .sort({ role: 1, name: 1 });

    res.json({
      success: true,
      data: workers.map(formatWorker),
    });
  } catch (error) {
    next(error);
  }
};

exports.getLiveBoard = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const openPolls = await Poll.find({
      status: 'open',
      opensAt: { $lte: now },
      closesAt: { $gt: now },
    })
      .populate('department', 'name code')
      .sort({ closesAt: 1 });

    const data = await summarizeLivePolls(openPolls);

    const coming = [];
    const notComing = [];
    const pending = [];
    data.forEach((poll) => {
      (poll.summary.teamRoster || []).forEach((member) => {
        const row = {
          ...member,
          department: poll.department,
          pollId: poll.id,
          pollTitle: poll.title,
          shift: poll.shift,
          closesAt: poll.closesAt,
        };
        if (member.status === 'coming') coming.push(row);
        else if (member.status === 'not_coming') notComing.push(row);
        else pending.push(row);
      });
    });

    res.json({
      success: true,
      data: {
        polls: data,
        coming,
        notComing,
        pending,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getDepartments = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const [departments, workers, incharges, openPolls] = await Promise.all([
      Department.find().select('name code isActive').sort({ name: 1 }),
      User.find({ role: 'worker', isActive: true }).select('department'),
      User.find({ role: 'incharge', isActive: true }).select('department'),
      Poll.find({ status: 'open', opensAt: { $lte: now }, closesAt: { $gt: now } }).populate('department', 'name code'),
    ]);
    const live = await summarizeLivePolls(openPolls);
    res.json({
      success: true,
      data: departments.map((dept) => departmentStats(dept, workers, incharges, live)),
    });
  } catch (error) {
    next(error);
  }
};

exports.getDepartment = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const department = await Department.findById(req.params.id).select('name code isActive');
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    const [workers, incharges, openPolls, people] = await Promise.all([
      User.find({ role: 'worker', isActive: true }).select('department'),
      User.find({ role: 'incharge', isActive: true }).select('department name employeeId phone'),
      Poll.find({
        department: department._id,
        status: 'open',
        opensAt: { $lte: now },
        closesAt: { $gt: now },
      }).populate('department', 'name code'),
      User.find({
        department: department._id,
        role: { $in: ['worker', 'incharge'] },
        isActive: true,
      })
        .select('name employeeId phone role department shiftStart shiftEnd pushToken isActive')
        .populate('department', 'name code')
        .sort({ role: 1, name: 1 }),
    ]);

    const livePolls = await summarizeLivePolls(openPolls);
    res.json({
      success: true,
      data: {
        department: departmentStats(department, workers, incharges, livePolls),
        incharges: people.filter((p) => p.role === 'incharge').map(formatWorker),
        employees: people.filter((p) => p.role === 'worker').map(formatWorker),
        livePolls,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.exportPollExcel = async (req, res, next) => {
  try {
    const poll = await loadPollOr404(req.params.pollId, res);
    if (!poll) return;
    const summary = await getPollSummary(poll, poll.department._id || poll.department);
    const buffer = await buildPollExcelBuffer(poll, summary);
    const filename = `FlexiTrack_HR_${(poll.department?.code || 'DEPT')}_${String(poll._id).slice(-6)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

exports.exportPollPdf = async (req, res, next) => {
  try {
    const poll = await loadPollOr404(req.params.pollId, res);
    if (!poll) return;
    const summary = await getPollSummary(poll, poll.department._id || poll.department);
    const buffer = await buildPollPdfBuffer(poll, summary);
    const filename = `FlexiTrack_HR_${(poll.department?.code || 'DEPT')}_${String(poll._id).slice(-6)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

exports.exportManpowerExcel = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status === 'open' || status === 'closed') filter.status = status;
    else filter.status = 'closed';

    const polls = await Poll.find(filter).sort({ date: -1 }).limit(80).populate('department', 'name code');
    const rows = [];
    for (const poll of polls) {
      if (!poll.department) continue;
      const summary = await getPollSummary(poll, poll.department._id || poll.department);
      rows.push({
        date: poll.date,
        department: poll.department?.name || '',
        shift: `${poll.shiftStart || ''}–${poll.shiftEnd || poll.shift}`,
        status: poll.status,
        coming: summary.coming,
        notComing: summary.notComing,
        pending: summary.pending,
        totalWorkers: summary.totalWorkers,
        attendanceRate: summary.attendanceRate,
        title: poll.title,
      });
    }
    const buffer = await buildRangeExcelBuffer(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="FlexiTrack_HR_Manpower_Plan.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const worker = await User.findById(req.params.employeeId)
      .select('name employeeId email phone role department incharge equipment process shiftStart shiftEnd shiftName isActive')
      .populate('department', 'name code')
      .populate('incharge', 'name employeeId shiftStart shiftEnd shiftName');

    if (!worker || !['worker', 'incharge'].includes(worker.role)) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const responses = await Response.find({ user: worker._id })
      .sort({ answeredAt: -1 })
      .limit(40)
      .populate({
        path: 'poll',
        select: 'title date shift shiftStart shiftEnd status department',
        populate: { path: 'department', select: 'name code' },
      });

    let directReports = null;
    if (worker.role === 'incharge') {
      const reports = await User.find({ incharge: worker._id, role: 'worker', isActive: true })
        .select('name employeeId phone equipment process shiftStart shiftEnd')
        .sort({ name: 1 });
      directReports = reports.map(formatWorker);
    }

    res.json({
      success: true,
      data: {
        employee: formatWorker(worker),
        directReports,
        history: responses.map((r) => ({
          id: String(r._id),
          answer: r.answer,
          answeredAt: r.answeredAt,
          poll: r.poll ? formatPoll(r.poll) : null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getFollowUps = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const openPolls = await Poll.find({
      status: 'open',
      opensAt: { $lte: now },
      closesAt: { $gt: now },
    }).populate('department', 'name code');

    const live = await Promise.all(
      openPolls
        .filter((poll) => poll.department)
        .map(async (poll) => {
          const summary = await getPollSummary(poll, poll.department._id || poll.department);
          return { poll: formatPoll(poll), summary };
        })
    );

    const records = await FollowUp.find({
      poll: { $in: openPolls.map((p) => p._id) },
    });
    const recordMap = new Map(records.map((r) => [`${r.worker}:${r.poll}`, r]));

    const items = [];
    live.forEach(({ poll, summary }) => {
      (summary.teamRoster || []).forEach((member) => {
        if (member.status === 'coming') return;
        const rec = recordMap.get(`${member.id}:${poll.id}`);
        items.push({
          workerId: String(member.id),
          name: member.name,
          employeeId: member.employeeId,
          phone: member.phone || '',
          department: poll.department,
          pollId: String(poll.id),
          pollTitle: poll.title,
          shift: poll.shift,
          shiftStart: poll.shiftStart,
          shiftEnd: poll.shiftEnd,
          closesAt: poll.closesAt,
          response: member.status,
          followUpStatus: rec?.status || 'pending',
          note: rec?.note || '',
          updatedAt: rec?.updatedAt || null,
        });
      });
    });

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

exports.updateFollowUp = async (req, res, next) => {
  try {
    const { workerId, pollId, status, note } = req.body;
    const allowed = ['pending', 'contacted', 'confirmed_coming', 'confirmed_not_coming'];
    if (!workerId || !pollId || !allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'workerId, pollId and a valid status are required' });
    }

    const record = await FollowUp.findOneAndUpdate(
      { worker: workerId, poll: pollId },
      { status, note: note || '', updatedBy: req.user._id },
      { upsert: true, new: true, runValidators: true }
    );

    if (status === 'confirmed_coming' || status === 'confirmed_not_coming') {
      await Response.findOneAndUpdate(
        { poll: pollId, user: workerId },
        { answer: status === 'confirmed_coming' ? 'yes' : 'no', answeredAt: new Date() },
        { upsert: true, new: true, runValidators: true }
      );
    }

    res.json({ success: true, message: 'Follow-up updated', data: record });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const ok = await user.comparePassword(currentPassword);
    if (!ok) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    next(error);
  }
};
