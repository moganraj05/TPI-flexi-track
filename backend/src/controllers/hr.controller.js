const prisma = require('../config/prisma');
const { autoCloseExpiredPolls } = require('../utils/poll');
const {
  getPollSummary,
  summarizePolls,
  summarizePollCounts,
  formatPoll,
  formatDept,
} = require('../utils/pollReport');
const { parsePagination, buildMeta } = require('../utils/pagination');
const {
  buildPollExcelBuffer,
  buildPollPdfBuffer,
  buildRangeExcelBuffer,
  buildDailyShiftsWorkbook,
} = require('../services/hr-export.service');
const { DEFAULT_SHIFT_START, DEFAULT_SHIFT_END } = require('../utils/shift');
const { resolveShift, getShiftByTimes, getShiftCatalog, getShiftByCode, formatShiftName } = require('../config/shiftCatalog');
const { buildTeamBulkTemplate, parseTeamBulkFile } = require('../services/bulk-import.service');
const { signToken } = require('../utils/jwt');
const { comparePassword, hashPassword } = require('../utils/password');
const { emitPollUpdate, emitFollowUpUpdate } = require('../realtime');

// Parses optional fromDate/toDate — same YYYY-MM-DD-only format and UTC
// midnight convention the existing single `date` filter already uses (both
// ultimately come from an <input type="date">, which only ever produces
// YYYY-MM-DD) — into a Prisma range filter for the `date` column. Returns
// { error } on anything invalid so callers can 400 instead of silently
// misfiltering or handing Prisma a NaN Date.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const parseDateRangeFilter = (fromDate, toDate) => {
  const range = {};

  if (fromDate !== undefined) {
    if (!DATE_ONLY_RE.test(fromDate)) return { error: 'fromDate must be in YYYY-MM-DD format' };
    const gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (Number.isNaN(gte.getTime())) return { error: 'fromDate is not a valid date' };
    range.gte = gte;
  }

  if (toDate !== undefined) {
    if (!DATE_ONLY_RE.test(toDate)) return { error: 'toDate must be in YYYY-MM-DD format' };
    const lte = new Date(`${toDate}T00:00:00.000Z`);
    if (Number.isNaN(lte.getTime())) return { error: 'toDate is not a valid date' };
    range.lte = lte;
  }

  if (range.gte && range.lte && range.gte > range.lte) {
    return { error: 'fromDate must be on or before toDate' };
  }

  return { range };
};

const HR_ROLES = ['hr', 'admin', 'superadmin'];

const formatHrUser = (user) => ({
  id: user.id,
  employeeId: user.employeeId,
  name: user.name,
  email: user.email || null,
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive !== false,
});

const formatIncharge = (inc) => {
  if (!inc) return null;
  return {
    id: inc.id,
    name: inc.name,
    employeeId: inc.employeeId,
    shiftStart: inc.shiftStart || null,
    shiftEnd: inc.shiftEnd || null,
    shiftName: inc.shiftName || '',
  };
};

const formatWorker = (w) => ({
  id: w.id,
  name: w.name,
  employeeId: w.employeeId,
  email: w.email || '',
  phone: w.phone || '',
  role: w.role,
  department: formatDept(w.department),
  incharge: w.incharge ? formatIncharge(w.incharge) : null,
  equipment: w.equipment || '',
  process: w.process || '',
  shiftStart: w.shiftStart || null,
  shiftEnd: w.shiftEnd || null,
  shiftName: w.shiftName || '',
  isActive: w.isActive !== false,
  hasNotifications: !!(w.pushToken && String(w.pushToken).startsWith('ExponentPushToken[')),
});

const summarizeLivePolls = async (polls) => {
  const withDept = polls.filter((poll) => poll.department);
  const summaries = await summarizePolls(withDept);
  return withDept.map((poll) => ({
    ...formatPoll(poll),
    department: formatDept(poll.department),
    summary: summaries.get(poll.id),
  }));
};

// Per-department head counts come from grouped COUNT queries rather than
// from fetching every worker/incharge row and filtering in JS.
const countsByDepartment = async (role) => {
  const groups = await prisma.user.groupBy({
    by: ['departmentId'],
    where: { role, isActive: true },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.departmentId, group._count._all]));
};

const departmentStats = (dept, workerCounts, inchargeCounts, live) => {
  const did = dept.id;
  const deptLive = live.filter((p) => p.department?.id === did);
  return {
    id: did,
    name: dept.name,
    code: dept.code,
    isActive: dept.isActive !== false,
    workers: workerCounts.get(did) || 0,
    incharges: inchargeCounts.get(did) || 0,
    livePolls: deptLive.length,
    coming: deptLive.reduce((n, p) => n + (p.summary?.coming || 0), 0),
    notComing: deptLive.reduce((n, p) => n + (p.summary?.notComing || 0), 0),
    pending: deptLive.reduce((n, p) => n + (p.summary?.pending || 0), 0),
  };
};

const pollInclude = {
  department: true,
  createdBy: { select: { id: true, name: true, employeeId: true } },
};

const inchargeSelect = {
  id: true,
  name: true,
  employeeId: true,
  shiftStart: true,
  shiftEnd: true,
  shiftName: true,
};

const departmentSelect = { id: true, name: true, code: true, isActive: true };

// Exactly the columns formatWorker reads. Replaces `include`, which pulls
// every User column — password hash included — for every row in a list.
const personSelect = {
  id: true,
  name: true,
  employeeId: true,
  email: true,
  phone: true,
  role: true,
  equipment: true,
  process: true,
  shiftStart: true,
  shiftEnd: true,
  shiftName: true,
  isActive: true,
  pushToken: true,
  department: { select: departmentSelect },
  incharge: { select: inchargeSelect },
};

// Columns formatHrUser reads.
const hrUserSelect = {
  id: true,
  employeeId: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
};

const loadPollOr404 = async (pollId, res) => {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: pollInclude });
  if (!poll) {
    res.status(404).json({ success: false, message: 'Poll not found' });
    return null;
  }
  await autoCloseExpiredPolls({ id: poll.id });
  return prisma.poll.findUnique({ where: { id: poll.id }, include: pollInclude });
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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !HR_ROLES.includes(user.role)) {
      return res.status(401).json({ success: false, message: 'Invalid HR credentials' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid HR credentials' });
    }

    const token = signToken(user);
    res.json({ success: true, data: { token, user: formatHrUser(user) } });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, data: formatHrUser(req.user) });
};

exports.logout = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};

exports.getDashboard = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();

    const [departments, workerCounts, inchargeCounts, workerTotal, inchargeTotal, notified, openPolls, closedPolls] =
      await Promise.all([
      prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
      countsByDepartment('worker'),
      countsByDepartment('incharge'),
      prisma.user.count({ where: { role: 'worker', isActive: true } }),
      prisma.user.count({ where: { role: 'incharge', isActive: true } }),
      // Matches the previous truthiness check on pushToken (a stored empty
      // string counted as "not notified", so it's excluded here too).
      prisma.user.count({
        where: { role: 'worker', isActive: true, pushToken: { not: null }, NOT: { pushToken: '' } },
      }),
      prisma.poll.findMany({
        where: { status: 'open', opensAt: { lte: now }, closesAt: { gt: now } },
        include: { department: true },
        orderBy: { closesAt: 'asc' },
      }),
      prisma.poll.findMany({
        where: { status: 'closed' },
        orderBy: { closesAt: 'desc' },
        take: 12,
        include: { department: true },
      }),
    ]);

    const live = await summarizeLivePolls(openPolls);
    const recent = await summarizeLivePolls(closedPolls);

    const coming = live.reduce((n, p) => n + (p.summary?.coming || 0), 0);
    const notComing = live.reduce((n, p) => n + (p.summary?.notComing || 0), 0);
    const pending = live.reduce((n, p) => n + (p.summary?.pending || 0), 0);

    const byDepartment = departments.map((dept) => departmentStats(dept, workerCounts, inchargeCounts, live));

    res.json({
      success: true,
      data: {
        stats: {
          departments: departments.length,
          workers: workerTotal,
          incharges: inchargeTotal,
          livePolls: live.length,
          coming,
          notComing,
          pending,
          notified,
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
    const { status, department, q, shiftStart, shiftEnd, date, fromDate, toDate, summary } = req.query;

    // Filters that define which polls exist for the current view. Shift/date
    // are applied on top of this for the rows, but the shift dropdown is
    // built from `baseWhere` so its options don't shrink to whatever the
    // current page happens to contain — a date range narrows it the same
    // way the single-day filter already does, not through baseWhere either.
    const baseWhere = {};
    if (status === 'open' || status === 'closed') baseWhere.status = status;
    if (department) baseWhere.departmentId = department;
    if (q?.trim()) {
      baseWhere.OR = [
        { title: { contains: q.trim(), mode: 'insensitive' } },
        { shift: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    const where = { ...baseWhere };
    if (shiftStart && shiftEnd) {
      where.shiftStart = shiftStart;
      where.shiftEnd = shiftEnd;
    }

    if (date) {
      // Exact single-day filter (Attendance's existing behavior) — takes
      // priority over fromDate/toDate if a caller somehow sent both, rather
      // than trying to combine an exact match with a range.
      where.date = new Date(`${date}T00:00:00.000Z`);
    } else if (fromDate !== undefined || toDate !== undefined) {
      const parsedRange = parseDateRangeFilter(fromDate, toDate);
      if (parsedRange.error) {
        return res.status(400).json({ success: false, message: parsedRange.error });
      }
      // fromDate-only or toDate-only both mean an open-ended range, not "no
      // filter" — an explicit boundary the caller asked for either way.
      where.date = parsedRange.range;
    }

    const pagination = parsePagination(req.query, { defaultLimit: 120 });

    const [total, polls, shiftGroups] = await Promise.all([
      prisma.poll.count({ where }),
      prisma.poll.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: pollInclude,
      }),
      prisma.poll.groupBy({
        by: ['shiftStart', 'shiftEnd'],
        where: baseWhere,
        orderBy: [{ shiftStart: 'asc' }, { shiftEnd: 'asc' }],
      }),
    ]);

    const withDept = polls.filter((poll) => poll.department);
    // `summary=counts` skips building per-poll rosters entirely. Full
    // summaries stay the default so existing clients see no change.
    const summaries =
      summary === 'counts' ? await summarizePollCounts(withDept) : await summarizePolls(withDept);
    const data = withDept.map((poll) => ({ ...formatPoll(poll), summary: summaries.get(poll.id) }));

    res.json({
      success: true,
      data,
      meta: {
        ...buildMeta(pagination, total),
        shifts: shiftGroups
          .filter((group) => group.shiftStart && group.shiftEnd)
          .map((group) => {
            const entry = getShiftByTimes(group.shiftStart, group.shiftEnd);
            return {
              shiftStart: group.shiftStart,
              shiftEnd: group.shiftEnd,
              code: entry?.code || null,
              label: formatShiftName(group.shiftStart, group.shiftEnd),
            };
          }),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPollDetail = async (req, res, next) => {
  try {
    const poll = await loadPollOr404(req.params.pollId, res);
    if (!poll) return;
    const summary = await getPollSummary(poll, poll.departmentId);
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

    // Scoped to the poll's own department — without this, a workerId from a
    // different department would still pass (worker exists, is active) and
    // record a response against a poll that was never theirs, corrupting
    // that poll's attendance count with a worker who was never on its roster.
    const worker = await prisma.user.findFirst({
      where: { id: workerId, role: 'worker', isActive: true, departmentId: poll.departmentId },
    });
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    await prisma.response.upsert({
      where: { pollId_userId: { pollId: poll.id, userId: worker.id } },
      create: { pollId: poll.id, userId: worker.id, answer, answeredAt: new Date() },
      update: { answer, answeredAt: new Date() },
    });

    emitPollUpdate({ pollId: poll.id, departmentId: poll.departmentId, workerId: worker.id, type: 'response' });

    const summary = await getPollSummary(poll, poll.departmentId);
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
    const { role, department, q } = req.query;

    const where = { role: { in: ['worker', 'incharge'] } };
    if (req.query.active === 'false') where.isActive = false;
    else if (req.query.active !== 'all') where.isActive = true;
    if (role === 'worker' || role === 'incharge') where.role = role;
    if (department) where.departmentId = department;
    if (q?.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { employeeId: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    // Previously unbounded, and it stays that way unless a client asks for
    // a page — so nothing that already calls this endpoint changes.
    const pagination = parsePagination(req.query);

    const [total, people] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: personSelect,
        // id breaks ties so offset paging is stable — two workers sharing a
        // name would otherwise be free to swap between pages.
        orderBy: [{ role: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    // Direct-report counts for the incharges on this page, as one grouped
    // query. Without this a caller can only get the number by holding the
    // entire workforce in memory and cross-referencing it.
    const inchargeIds = people.filter((p) => p.role === 'incharge').map((p) => p.id);
    const reportGroups = inchargeIds.length
      ? await prisma.user.groupBy({
          by: ['inchargeId'],
          where: { inchargeId: { in: inchargeIds }, role: 'worker', isActive: true },
          _count: { _all: true },
        })
      : [];
    const reportCounts = new Map(reportGroups.map((g) => [g.inchargeId, g._count._all]));

    res.json({
      success: true,
      data: people.map((person) => {
        const formatted = formatWorker(person);
        if (person.role !== 'incharge') return formatted;
        return { ...formatted, reportCount: reportCounts.get(person.id) || 0 };
      }),
      meta: buildMeta(pagination, total),
    });
  } catch (error) {
    next(error);
  }
};

exports.getLiveBoard = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const openPolls = await prisma.poll.findMany({
      where: { status: 'open', opensAt: { lte: now }, closesAt: { gt: now } },
      include: { department: true },
      orderBy: { closesAt: 'asc' },
    });

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
      data: { polls: data, coming, notComing, pending },
    });
  } catch (error) {
    next(error);
  }
};

exports.getDepartments = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const [departments, workerCounts, inchargeCounts, openPolls] = await Promise.all([
      prisma.department.findMany({
        select: { id: true, name: true, code: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      countsByDepartment('worker'),
      countsByDepartment('incharge'),
      prisma.poll.findMany({
        where: { status: 'open', opensAt: { lte: now }, closesAt: { gt: now } },
        include: { department: true },
      }),
    ]);
    const live = await summarizeLivePolls(openPolls);
    res.json({
      success: true,
      data: departments.map((dept) => departmentStats(dept, workerCounts, inchargeCounts, live)),
    });
  } catch (error) {
    next(error);
  }
};

exports.getDepartment = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, code: true, isActive: true },
    });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    const [workerCounts, inchargeCounts, openPolls, people] = await Promise.all([
      countsByDepartment('worker'),
      countsByDepartment('incharge'),
      prisma.poll.findMany({
        where: { departmentId: department.id, status: 'open', opensAt: { lte: now }, closesAt: { gt: now } },
        include: { department: true },
      }),
      prisma.user.findMany({
        where: { departmentId: department.id, role: { in: ['worker', 'incharge'] }, isActive: true },
        select: personSelect,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const livePolls = await summarizeLivePolls(openPolls);
    res.json({
      success: true,
      data: {
        department: departmentStats(department, workerCounts, inchargeCounts, livePolls),
        incharges: people.filter((p) => p.role === 'incharge').map(formatWorker),
        employees: people.filter((p) => p.role === 'worker').map(formatWorker),
        livePolls,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name?.trim() || !code?.trim()) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const existing = await prisma.department.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A plant with this code already exists' });
    }

    const dept = await prisma.department.create({ data: { name: name.trim(), code: normalizedCode } });
    res.status(201).json({ success: true, message: 'Plant created', data: formatDept(dept) });
  } catch (error) {
    next(error);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    const { name, code, isActive } = req.body;
    const data = {};

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      data.name = name.trim();
    }

    if (code !== undefined) {
      if (!code?.trim()) {
        return res.status(400).json({ success: false, message: 'Code cannot be empty' });
      }
      const normalizedCode = code.trim().toUpperCase();
      if (normalizedCode !== dept.code) {
        const existing = await prisma.department.findUnique({ where: { code: normalizedCode } });
        if (existing) {
          return res.status(400).json({ success: false, message: 'A plant with this code already exists' });
        }
      }
      data.code = normalizedCode;
    }

    if (isActive !== undefined) {
      data.isActive = !!isActive;
    }

    const updated = await prisma.department.update({ where: { id: dept.id }, data });
    res.json({ success: true, message: 'Plant updated', data: formatDept(updated) });
  } catch (error) {
    next(error);
  }
};

exports.deactivateDepartment = async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Plant not found' });
    }

    const activePeople = await prisma.user.count({
      where: { departmentId: dept.id, isActive: true, role: { in: ['worker', 'incharge'] } },
    });
    if (activePeople > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot deactivate — ${activePeople} active worker(s)/incharge(s) are still assigned to this plant. Reassign or deactivate them first.`,
      });
    }

    await prisma.department.update({ where: { id: dept.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Plant deactivated' });
  } catch (error) {
    next(error);
  }
};

exports.createTeamMember = async (req, res, next) => {
  try {
    const {
      employeeId,
      name,
      phone,
      email,
      password,
      role,
      department,
      shiftName,
      equipment,
      process: processField,
      incharge,
    } = req.body;

    if (!employeeId?.trim() || !name?.trim() || !password || !role || !department) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, name, password, role and plant are required',
      });
    }
    if (!['worker', 'incharge'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be worker or incharge' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const dept = await prisma.department.findUnique({ where: { id: department } });
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Plant not found' });
    }

    const shift = resolveShift(req.body, DEFAULT_SHIFT_START, DEFAULT_SHIFT_END);
    if (shift.error) {
      return res.status(400).json({ success: false, message: shift.error });
    }

    const normalizedId = employeeId.trim().toUpperCase();
    const existingId = await prisma.user.findUnique({ where: { employeeId: normalizedId } });
    if (existingId) {
      return res.status(400).json({ success: false, message: 'Employee ID already exists' });
    }

    let inchargeId = null;
    if (role === 'worker' && incharge) {
      const inchargeDoc = await prisma.user.findFirst({
        where: { id: incharge, role: 'incharge', departmentId: dept.id, isActive: true },
      });
      if (!inchargeDoc) {
        return res.status(400).json({ success: false, message: 'Incharge not found in this plant' });
      }
      inchargeId = inchargeDoc.id;
    }

    const member = await prisma.user.create({
      data: {
        employeeId: normalizedId,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || '',
        password: await hashPassword(password),
        role,
        departmentId: dept.id,
        inchargeId,
        equipment: role === 'worker' ? equipment?.trim() || '' : '',
        process: role === 'worker' ? processField?.trim() || '' : '',
        shiftStart: shift.shiftStart,
        shiftEnd: shift.shiftEnd,
        // A caller-supplied shiftName (legacy free-text path) wins if sent
        // explicitly; otherwise the catalog's own name (e.g. "Shift A") when
        // shiftCode/matching times resolved one, else blank.
        shiftName: shiftName?.trim() || shift.shiftName || '',
      },
    });

    const populated = await prisma.user.findUnique({
      where: { id: member.id },
      select: personSelect,
    });

    res.status(201).json({
      success: true,
      message: `${role === 'worker' ? 'Worker' : 'Incharge'} created`,
      data: formatWorker(populated),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateTeamMember = async (req, res, next) => {
  try {
    const member = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: ['worker', 'incharge'] } } });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const { name, phone, email, password, department, shiftName, equipment, process: processField, incharge, isActive } =
      req.body;
    const data = {};

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      data.name = name.trim();
    }

    if (phone !== undefined) data.phone = phone?.trim() || '';
    if (email !== undefined) data.email = email?.trim() || null;

    let effectiveDepartmentId = member.departmentId;
    if (department !== undefined) {
      const dept = await prisma.department.findUnique({ where: { id: department } });
      if (!dept) {
        return res.status(400).json({ success: false, message: 'Plant not found' });
      }
      data.departmentId = dept.id;
      effectiveDepartmentId = dept.id;
    }

    let resolvedShiftName;
    if (req.body.shiftCode !== undefined || req.body.shiftStart !== undefined || req.body.shiftEnd !== undefined) {
      const shift = resolveShift(
        req.body,
        member.shiftStart || DEFAULT_SHIFT_START,
        member.shiftEnd || DEFAULT_SHIFT_END
      );
      if (shift.error) {
        return res.status(400).json({ success: false, message: shift.error });
      }
      data.shiftStart = shift.shiftStart;
      data.shiftEnd = shift.shiftEnd;
      resolvedShiftName = shift.shiftName;
    }
    if (shiftName !== undefined) data.shiftName = shiftName?.trim() || '';
    else if (resolvedShiftName !== undefined) data.shiftName = resolvedShiftName;

    if (member.role === 'worker') {
      if (equipment !== undefined) data.equipment = equipment?.trim() || '';
      if (processField !== undefined) data.process = processField?.trim() || '';
      if (incharge !== undefined) {
        if (incharge) {
          const inchargeDoc = await prisma.user.findFirst({
            where: { id: incharge, role: 'incharge', departmentId: effectiveDepartmentId, isActive: true },
          });
          if (!inchargeDoc) {
            return res.status(400).json({ success: false, message: 'Incharge not found in this plant' });
          }
          data.inchargeId = inchargeDoc.id;
        } else {
          data.inchargeId = null;
        }
      }
    }

    if (isActive !== undefined) {
      data.isActive = !!isActive;
      if (!data.isActive) data.pushToken = null;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      data.password = await hashPassword(password);
    }

    await prisma.user.update({ where: { id: member.id }, data });
    const populated = await prisma.user.findUnique({
      where: { id: member.id },
      select: personSelect,
    });

    res.json({ success: true, message: 'Updated', data: formatWorker(populated) });
  } catch (error) {
    next(error);
  }
};

exports.deactivateTeamMember = async (req, res, next) => {
  try {
    const member = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: ['worker', 'incharge'] } } });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (member.role === 'incharge') {
      const directReportCount = await prisma.user.count({
        where: { inchargeId: member.id, role: 'worker', isActive: true },
      });
      if (directReportCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot deactivate — ${directReportCount} worker(s) still report to this incharge. Reassign them first.`,
        });
      }
    }

    await prisma.user.update({ where: { id: member.id }, data: { isActive: false, pushToken: null } });

    res.json({ success: true, message: `${member.role === 'worker' ? 'Worker' : 'Incharge'} deactivated` });
  } catch (error) {
    next(error);
  }
};

// The fillable spreadsheet a plant's HR downloads before a bulk import —
// a real example row plus read-only lookup sheets for that plant's
// incharges and the fixed shift codes, so nothing needed to fill it out
// correctly has to be looked up elsewhere.
exports.exportTeamBulkTemplate = async (req, res, next) => {
  try {
    const { department } = req.query;
    const dept = department
      ? await prisma.department.findUnique({ where: { id: department } })
      : await prisma.department.findFirst({ where: { isActive: true } });
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Plant not found' });
    }

    const incharges = await prisma.user.findMany({
      where: { departmentId: dept.id, role: 'incharge', isActive: true },
      select: { employeeId: true, name: true },
      orderBy: { name: 'asc' },
    });

    const buffer = await buildTeamBulkTemplate(dept, incharges);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="FlexiTrack_HR_BulkWorkers_${dept.code}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

// Bulk-creates workers from an uploaded spreadsheet. Every row is validated
// and inserted independently — one bad row (duplicate ID, unknown shift
// code, unrecognized incharge) is reported and skipped rather than failing
// the whole batch, since a HR user re-uploading a 50-row file to fix one
// typo is worse UX than just telling them which row needs fixing.
exports.importTeamBulk = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'An Excel file is required' });
    }

    const dept = req.body.department
      ? await prisma.department.findUnique({ where: { id: req.body.department } })
      : null;
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Plant not found' });
    }

    const { rows, error } = await parseTeamBulkFile(req.file.buffer);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No data rows found in the uploaded file' });
    }

    const incharges = await prisma.user.findMany({
      where: { departmentId: dept.id, role: 'incharge' },
      select: { id: true, employeeId: true, name: true },
    });
    const inchargeByEmpId = new Map(incharges.map((i) => [i.employeeId.toUpperCase(), i]));
    // A name -> 'AMBIGUOUS' sentinel when two incharges share a name, so a
    // row that only gave a name (instead of the safer ID) fails loudly
    // rather than silently picking whichever one happened to be first.
    const inchargeByName = new Map();
    incharges.forEach((i) => {
      const key = i.name.trim().toLowerCase();
      inchargeByName.set(key, inchargeByName.has(key) ? 'AMBIGUOUS' : i);
    });

    const seenIds = new Set();
    let created = 0;
    const errors = [];

    for (const row of rows) {
      try {
        if (!row.employeeId) throw new Error('Employee ID is required');
        if (!row.name) throw new Error('Name is required');
        if (!row.password || row.password.length < 6) throw new Error('Password must be at least 6 characters');

        const shift = getShiftByCode(row.shiftCode);
        if (!shift) throw new Error(`Invalid shift code "${row.shiftCode || ''}" — use A, B, C, D or E`);

        const normalizedId = row.employeeId.toUpperCase();
        if (seenIds.has(normalizedId)) throw new Error('Duplicate Employee ID in this file');
        seenIds.add(normalizedId);

        const existing = await prisma.user.findUnique({ where: { employeeId: normalizedId } });
        if (existing) throw new Error('Employee ID already exists');

        let inchargeId = null;
        if (row.inchargeId) {
          const match = inchargeByEmpId.get(row.inchargeId.toUpperCase());
          if (!match) throw new Error(`Incharge ID "${row.inchargeId}" not found in this plant`);
          inchargeId = match.id;
        } else if (row.inchargeName) {
          const match = inchargeByName.get(row.inchargeName.toLowerCase());
          if (!match) throw new Error(`Incharge name "${row.inchargeName}" not found in this plant`);
          if (match === 'AMBIGUOUS') {
            throw new Error(`Incharge name "${row.inchargeName}" matches more than one incharge — use Incharge ID instead`);
          }
          inchargeId = match.id;
        }

        await prisma.user.create({
          data: {
            employeeId: normalizedId,
            name: row.name,
            phone: row.phone || '',
            email: row.email || null,
            password: await hashPassword(row.password),
            role: 'worker',
            departmentId: dept.id,
            inchargeId,
            equipment: row.equipment || '',
            process: row.process || '',
            shiftStart: shift.shiftStart,
            shiftEnd: shift.shiftEnd,
            shiftName: shift.name,
          },
        });
        created += 1;
      } catch (err) {
        const message = err.code === 'P2002' ? 'Duplicate value (employee ID or email already used)' : err.message;
        errors.push({ row: row.rowNumber, employeeId: row.employeeId, message });
      }
    }

    res.json({
      success: true,
      message: `${created} worker(s) created${errors.length ? `, ${errors.length} row(s) skipped` : ''}`,
      data: { created, failed: errors.length, errors },
    });
  } catch (error) {
    next(error);
  }
};

exports.getHrAdmins = async (req, res, next) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: HR_ROLES } },
      select: hrUserSelect,
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: admins.map(formatHrUser) });
  } catch (error) {
    next(error);
  }
};

exports.createHrAdmin = async (req, res, next) => {
  try {
    const { employeeId, name, email, phone, password, role } = req.body;

    if (!employeeId?.trim() || !name?.trim() || !email?.trim() || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, name, email, password and role are required',
      });
    }
    if (!HR_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be hr, admin or superadmin' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalizedId = employeeId.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { OR: [{ employeeId: normalizedId }, { email: normalizedEmail }] },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Employee ID or email is already in use' });
    }

    const admin = await prisma.user.create({
      data: {
        employeeId: normalizedId,
        name: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || '',
        password: await hashPassword(password),
        role,
      },
    });

    res.status(201).json({ success: true, message: 'HR login created', data: formatHrUser(admin) });
  } catch (error) {
    next(error);
  }
};

exports.updateHrAdmin = async (req, res, next) => {
  try {
    const admin = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: HR_ROLES } } });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'HR login not found' });
    }

    const { name, phone, isActive } = req.body;
    const data = {};

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      }
      data.name = name.trim();
    }
    if (phone !== undefined) data.phone = phone?.trim() || '';

    if (isActive !== undefined) {
      if (!isActive && admin.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot deactivate your own login' });
      }
      if (!isActive) {
        const otherActiveAdmins = await prisma.user.count({
          where: { id: { not: admin.id }, role: { in: HR_ROLES }, isActive: true },
        });
        if (otherActiveAdmins === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot deactivate the last remaining HR/admin login',
          });
        }
      }
      data.isActive = !!isActive;
    }

    const updated = await prisma.user.update({ where: { id: admin.id }, data });
    res.json({ success: true, message: 'HR login updated', data: formatHrUser(updated) });
  } catch (error) {
    next(error);
  }
};

exports.deactivateHrAdmin = async (req, res, next) => {
  try {
    const admin = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: HR_ROLES } } });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'HR login not found' });
    }

    if (admin.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own login' });
    }

    const otherActiveAdmins = await prisma.user.count({
      where: { id: { not: admin.id }, role: { in: HR_ROLES }, isActive: true },
    });
    if (otherActiveAdmins === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate the last remaining HR/admin login',
      });
    }

    await prisma.user.update({ where: { id: admin.id }, data: { isActive: false } });

    res.json({ success: true, message: 'HR login deactivated' });
  } catch (error) {
    next(error);
  }
};

exports.exportPollExcel = async (req, res, next) => {
  try {
    const poll = await loadPollOr404(req.params.pollId, res);
    if (!poll) return;
    const summary = await getPollSummary(poll, poll.departmentId);
    const buffer = await buildPollExcelBuffer(poll, summary);
    const filename = `FlexiTrack_HR_${(poll.department?.code || 'DEPT')}_${String(poll.id).slice(-6)}.xlsx`;
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
    const summary = await getPollSummary(poll, poll.departmentId);
    const buffer = await buildPollPdfBuffer(poll, summary);
    const filename = `FlexiTrack_HR_${(poll.department?.code || 'DEPT')}_${String(poll.id).slice(-6)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

exports.exportManpowerExcel = async (req, res, next) => {
  try {
    const { status, fromDate, toDate } = req.query;
    const where = {};
    if (status === 'open' || status === 'closed') where.status = status;
    else where.status = 'closed';

    // Deliberately still every plant regardless of what's selected in
    // Reports.jsx (matches this export's own "across all recent polls,
    // every plant" description) — but the date range IS what the caller is
    // currently looking at, so exporting a fixed "most recent 80, any date"
    // here would silently disagree with the filtered list on screen.
    if (fromDate !== undefined || toDate !== undefined) {
      const parsedRange = parseDateRangeFilter(fromDate, toDate);
      if (parsedRange.error) {
        return res.status(400).json({ success: false, message: parsedRange.error });
      }
      where.date = parsedRange.range;
    }

    const polls = await prisma.poll.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 80,
      include: { department: true },
    });
    const withDept = polls.filter((poll) => poll.department);
    const summaries = await summarizePolls(withDept);
    const rows = withDept.map((poll) => {
      const summary = summaries.get(poll.id);
      return {
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
      };
    });
    const buffer = await buildRangeExcelBuffer(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="FlexiTrack_HR_Manpower_Plan.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

// One workbook, one tab per catalog shift (A-E), for a single plant+date —
// so "download everything that ran today" is one file instead of chasing
// down each shift's poll individually.
exports.exportDailyShiftsExcel = async (req, res, next) => {
  try {
    const { date, department } = req.query;
    if (!DATE_ONLY_RE.test(date || '')) {
      return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format' });
    }
    const dept = department ? await prisma.department.findUnique({ where: { id: department } }) : null;
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Plant not found' });
    }

    const dayDate = new Date(`${date}T00:00:00.000Z`);
    const catalog = getShiftCatalog();
    const polls = await prisma.poll.findMany({
      where: {
        departmentId: dept.id,
        date: dayDate,
        OR: catalog.map((s) => ({ shiftStart: s.shiftStart, shiftEnd: s.shiftEnd })),
      },
      include: pollInclude,
    });
    const pollByTimes = new Map(polls.map((p) => [`${p.shiftStart}|${p.shiftEnd}`, p]));

    const shiftEntries = await Promise.all(
      catalog.map(async (catalogEntry) => {
        const poll = pollByTimes.get(`${catalogEntry.shiftStart}|${catalogEntry.shiftEnd}`) || null;
        const summary = poll ? await getPollSummary(poll, poll.departmentId) : null;
        return { catalogEntry, poll, summary };
      })
    );

    const buffer = await buildDailyShiftsWorkbook(shiftEntries);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="FlexiTrack_HR_DailyShifts_${date}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const worker = await prisma.user.findUnique({
      where: { id: req.params.employeeId },
      select: personSelect,
    });

    if (!worker || !['worker', 'incharge'].includes(worker.role)) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const historyPagination = parsePagination(req.query, { defaultLimit: 40 });
    const [historyTotal, responses] = await Promise.all([
      prisma.response.count({ where: { userId: worker.id } }),
      prisma.response.findMany({
        where: { userId: worker.id },
        orderBy: [{ answeredAt: 'desc' }, { id: 'desc' }],
        skip: historyPagination.skip,
        take: historyPagination.take,
        include: {
          poll: {
            select: {
              id: true,
              title: true,
              date: true,
              shift: true,
              shiftStart: true,
              shiftEnd: true,
              status: true,
              department: { select: departmentSelect },
            },
          },
        },
      }),
    ]);

    let directReports = null;
    if (worker.role === 'incharge') {
      const reports = await prisma.user.findMany({
        where: { inchargeId: worker.id, role: 'worker', isActive: true },
        select: {
          id: true,
          name: true,
          employeeId: true,
          phone: true,
          equipment: true,
          process: true,
          shiftStart: true,
          shiftEnd: true,
        },
        orderBy: { name: 'asc' },
      });
      directReports = reports.map(formatWorker);
    }

    res.json({
      success: true,
      data: {
        employee: formatWorker(worker),
        directReports,
        history: responses.map((r) => ({
          id: r.id,
          answer: r.answer,
          answeredAt: r.answeredAt,
          poll: r.poll ? formatPoll(r.poll) : null,
        })),
      },
      meta: buildMeta(historyPagination, historyTotal),
    });
  } catch (error) {
    next(error);
  }
};

exports.getFollowUps = async (req, res, next) => {
  try {
    await autoCloseExpiredPolls();
    const now = new Date();
    const openPolls = await prisma.poll.findMany({
      where: { status: 'open', opensAt: { lte: now }, closesAt: { gt: now } },
      include: { department: true },
    });

    const withDept = openPolls.filter((poll) => poll.department);
    const followUpSummaries = await summarizePolls(withDept);
    const live = withDept.map((poll) => ({ poll: formatPoll(poll), summary: followUpSummaries.get(poll.id) }));

    const records = await prisma.followUp.findMany({
      where: { pollId: { in: openPolls.map((p) => p.id) } },
    });
    const recordMap = new Map(records.map((r) => [`${r.workerId}:${r.pollId}`, r]));

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

    // Verified up front (not just relied on the DB's foreign keys to reject
    // a bad id) so a mismatched pair — a real worker and a real poll, just
    // not each other's — can't silently record a Response for a worker who
    // was never on that poll's roster, corrupting its attendance count.
    const poll = await prisma.poll.findUnique({ where: { id: pollId }, select: { departmentId: true } });
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found' });
    }
    const worker = await prisma.user.findFirst({
      where: { id: workerId, role: 'worker', isActive: true, departmentId: poll.departmentId },
    });
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found in this poll\'s department' });
    }

    const record = await prisma.followUp.upsert({
      where: { workerId_pollId: { workerId, pollId } },
      create: { workerId, pollId, status, note: note || '', updatedById: req.user.id },
      update: { status, note: note || '', updatedById: req.user.id },
    });

    if (status === 'confirmed_coming' || status === 'confirmed_not_coming') {
      await prisma.response.upsert({
        where: { pollId_userId: { pollId, userId: workerId } },
        create: {
          pollId,
          userId: workerId,
          answer: status === 'confirmed_coming' ? 'yes' : 'no',
          answeredAt: new Date(),
        },
        update: { answer: status === 'confirmed_coming' ? 'yes' : 'no', answeredAt: new Date() },
      });
      emitPollUpdate({ pollId, departmentId: poll.departmentId, workerId, type: 'response' });
    }

    emitFollowUpUpdate({ pollId, workerId });

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

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = await comparePassword(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(newPassword) } });
    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    next(error);
  }
};
