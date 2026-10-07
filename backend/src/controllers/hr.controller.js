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
const { signToken, revokeSession, renewedToken } = require('../utils/jwt');
const { comparePassword, hashPassword, DUMMY_HASH } = require('../utils/password');
const { emitPollUpdate, emitFollowUpUpdate, emitStaffUpdate, emitWorkforceUpdate } = require('../realtime');
const logger = require('../utils/logger');
const { recordAudit, diffChanges, personLabel, roleName } = require('../services/audit.service');
const crypto = require('crypto');
const { INVITE_TTL_HOURS, createInviteToken, inviteLink } = require('../services/staff-invite.service');
const { tempPasswordData } = require('../services/temp-password.service');
const { sendStaffInviteEmail } = require('../services/email.service');
const { passwordHistoryFor } = require('./reset-requests.controller');

// Roles an admin can give a console login: Staff (hr) or Admin (admin).
// Existing superadmin accounts keep working (and show as "Admin"); new ones
// are only created by the seed script.
const ASSIGNABLE_STAFF_ROLES = ['hr', 'admin'];

// Emails the invitation link. Returns true when it was handed to the email
// provider; false when sending failed (the login still exists, and an admin
// can use "Resend invitation").
async function emailStaffInvite(req, user) {
  try {
    await sendStaffInviteEmail({
      to: user.email,
      name: user.name,
      roleLabel: roleName(user.role),
      invitedBy: req.user?.name || 'An administrator',
      link: inviteLink(req, createInviteToken(user)),
      expiresInHours: INVITE_TTL_HOURS,
    });
    return true;
  } catch (error) {
    logger.error('email.invite_send_failed', { userId: user.id, error: error.message });
    return false;
  }
}

// ---- audit helpers ----
// Human-readable snapshot of a worker/incharge for the audit trail's
// before -> after list (person rows loaded with personSelect).
const memberSnapshot = (p) =>
  p && {
    name: p.name,
    phone: p.phone || '',
    email: p.email || '',
    plant: p.department ? `${p.department.name} (${p.department.code})` : '',
    shift: p.shiftStart && p.shiftEnd ? formatShiftName(p.shiftStart, p.shiftEnd) : '',
    incharge: p.incharge ? p.incharge.name : '',
    equipment: p.equipment || '',
    process: p.process || '',
    status: p.isActive === false ? 'Inactive' : 'Active',
  };
const MEMBER_AUDIT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'plant', label: 'Plant' },
  { key: 'shift', label: 'Shift' },
  { key: 'incharge', label: 'Incharge' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'process', label: 'Process' },
  { key: 'status', label: 'Status' },
  { key: 'password', label: 'Password' },
];
const roleWord = (role) => (role === 'incharge' ? 'incharge' : 'worker');
const pollLabel = (poll) => `${poll.shift} · ${new Date(poll.date).toISOString().slice(0, 10)}${poll.department?.code ? ` · ${poll.department.code}` : ''}`;
const answerLabel = (answer) => (answer === 'yes' ? 'Coming' : answer === 'no' ? 'Not coming' : null);
const { notificationChannelSelect, hasNotificationChannel, reachableWhere, notifyUsers } = require('../services/notification.service');

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
  approvalStatus: user.approvalStatus || 'approved',
  // Invited by an admin and hasn't set a password yet (can't sign in).
  invitePending: user.mustSetPassword === true,
  invitedAt: user.invitedAt || null,
  department: user.department ? { id: user.department.id, name: user.department.name, code: user.department.code } : null,
  createdAt: user.createdAt || null,
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
  hasNotifications: hasNotificationChannel(w),
  // Signed up with / was given a temporary password and hasn't set their own yet.
  mustChangePassword: w.mustChangePassword === true,
  tempPasswordExpiresAt: w.tempPasswordExpiresAt || null,
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
  ...notificationChannelSelect,
  mustChangePassword: true,
  tempPasswordExpiresAt: true,
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
  approvalStatus: true,
  mustSetPassword: true,
  invitedAt: true,
  createdAt: true,
  department: { select: departmentSelect },
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

    const user = await prisma.user.findUnique({ where: { email }, include: { department: { select: departmentSelect } } });

    // The password is always checked (against a dummy hash when the email is
    // unknown) so the response time is the same either way, and the account's
    // status is only revealed to someone who already knows its password.
    const isMatch = await comparePassword(String(password), user?.password || DUMMY_HASH);
    const signInFailed = (reason) =>
      recordAudit(req, {
        action: 'auth.staff_sign_in_failed',
        entityType: 'user',
        entityId: user?.id,
        entityLabel: email,
        summary: `Failed staff sign-in for ${email}`,
        metadata: { reason },
        actor: { name: user && isMatch ? user.name : null, role: user && isMatch ? user.role : null, identifier: email },
      });

    if (!user || !isMatch || !HR_ROLES.includes(user.role)) {
      await signInFailed(
        !user ? 'unknown_email' : user.mustSetPassword ? 'invite_not_accepted' : !isMatch ? 'wrong_password' : 'not_a_staff_account'
      );
      // Same message whatever the reason, so it can't reveal which emails
      // have accounts; the second sentence helps newly invited people.
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. New here? Set your password with the link in your invitation email first.',
      });
    }

    if (user.approvalStatus === 'pending') {
      await signInFailed('awaiting_approval');
      return res.status(403).json({
        success: false,
        message: 'Your account is waiting for administrator approval. You will receive an email once it is approved.',
      });
    }
    if (!user.isActive) {
      await signInFailed('account_deactivated');
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact your administrator.',
      });
    }

    const token = signToken(user);
    await recordAudit(req, {
      action: 'auth.staff_signed_in',
      entityType: 'user',
      entityId: user.id,
      entityLabel: personLabel(user),
      summary: `${user.name} signed in to the staff console`,
      actor: { id: user.id, name: user.name, role: user.role, identifier: user.email },
    });
    res.json({ success: true, data: { token, user: formatHrUser(user) } });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  // `token`: a renewed token when the current one is old (the console saves
  // it), so an active user is never signed out by expiry.
  res.json({ success: true, data: formatHrUser(req.user), token: renewedToken(req.user, req.auth) });
};

exports.logout = async (req, res, next) => {
  try {
    // This browser only — the same login stays signed in elsewhere.
    await revokeSession(req.auth, req.user.id);
    await recordAudit(req, {
      action: 'auth.staff_signed_out',
      entityType: 'user',
      entityId: req.user.id,
      entityLabel: personLabel(req.user),
      summary: `${req.user.name} signed out of the staff console`,
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
      // Workers reachable on at least one channel: the Android APK (Expo
      // token) or a browser / installed web app (Web Push subscription).
      prisma.user.count({ where: { role: 'worker', isActive: true, ...reachableWhere } }),
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

    const previous = await prisma.response.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId: worker.id } },
      select: { answer: true },
    });

    await prisma.response.upsert({
      where: { pollId_userId: { pollId: poll.id, userId: worker.id } },
      create: { pollId: poll.id, userId: worker.id, answer, answeredAt: new Date() },
      update: { answer, answeredAt: new Date() },
    });

    await recordAudit(req, {
      action: 'attendance.marked',
      entityType: 'poll',
      entityId: poll.id,
      entityLabel: pollLabel(poll),
      summary: `Marked ${personLabel(worker)} as ${answerLabel(answer).toLowerCase()} for ${pollLabel(poll)}`,
      changes: [{ field: 'answer', label: 'Answer', from: answerLabel(previous?.answer) ?? 'No response', to: answerLabel(answer) }],
      metadata: { workerId: worker.id, workerEmployeeId: worker.employeeId },
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
    await recordAudit(req, {
      action: 'plant.created',
      entityType: 'plant',
      entityId: dept.id,
      entityLabel: `${dept.name} (${dept.code})`,
      summary: `Created plant ${dept.name} (${dept.code})`,
    });
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
    const plantChanges = diffChanges(
      { name: dept.name, code: dept.code, status: dept.isActive ? 'Active' : 'Inactive' },
      { name: updated.name, code: updated.code, status: updated.isActive ? 'Active' : 'Inactive' },
      [
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'status', label: 'Status' },
      ]
    );
    if (plantChanges.length) {
      await recordAudit(req, {
        action: 'plant.updated',
        entityType: 'plant',
        entityId: dept.id,
        entityLabel: `${updated.name} (${updated.code})`,
        summary: `Updated plant ${updated.name} (${updated.code}): ${plantChanges.map((c) => c.label.toLowerCase()).join(', ')}`,
        changes: plantChanges,
      });
    }
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
    await recordAudit(req, {
      action: 'plant.deactivated',
      entityType: 'plant',
      entityId: dept.id,
      entityLabel: `${dept.name} (${dept.code})`,
      summary: `Deactivated plant ${dept.name} (${dept.code})`,
      changes: [{ field: 'status', label: 'Status', from: 'Active', to: 'Inactive' }],
    });
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

    if (!employeeId?.trim() || !name?.trim() || !role || !department) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, name, role and plant are required',
      });
    }
    if (!['worker', 'incharge'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be worker or incharge' });
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

    // Every new account starts with its own temporary password (generated
    // unless one was sent), and must set a personal one at first sign-in.
    const temp = await tempPasswordData('new_account', password || undefined);
    const member = await prisma.user.create({
      data: {
        employeeId: normalizedId,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || '',
        ...temp.data,
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

    const createdSnapshot = memberSnapshot(populated);
    await recordAudit(req, {
      action: 'member.created',
      entityType: 'user',
      entityId: member.id,
      entityLabel: personLabel(populated),
      summary: `Added ${roleWord(role)} ${personLabel(populated)} to ${createdSnapshot.plant}`,
      changes: diffChanges({}, createdSnapshot, MEMBER_AUDIT_FIELDS.filter((f) => f.key !== 'password' && f.key !== 'status')),
      metadata: { role },
    });

    emitWorkforceUpdate({ type: 'created' });
    res.status(201).json({
      success: true,
      message: `${role === 'worker' ? 'Worker' : 'Incharge'} created`,
      // Shown once to whoever created the account, never again.
      data: {
        ...formatWorker(populated),
        temporaryPassword: password ? null : temp.plain,
        temporaryPasswordExpiresAt: temp.expiresAt,
      },
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
    const beforeSnapshot = memberSnapshot(await prisma.user.findUnique({ where: { id: member.id }, select: personSelect }));

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
      if (!data.isActive) {
        data.pushToken = null;
        data.webPushSubscriptions = { deleteMany: {} };
      }
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      // A password typed by someone else is only ever temporary.
      Object.assign(data, (await tempPasswordData('reset', password)).data, { tokenVersion: { increment: 1 } });
    }

    await prisma.user.update({ where: { id: member.id }, data });
    const populated = await prisma.user.findUnique({
      where: { id: member.id },
      select: personSelect,
    });

    const memberChanges = diffChanges(
      beforeSnapshot,
      { ...memberSnapshot(populated), password: password || undefined },
      MEMBER_AUDIT_FIELDS
    );
    if (memberChanges.length) {
      const deactivated = beforeSnapshot.status === 'Active' && populated.isActive === false;
      await recordAudit(req, {
        action: deactivated ? 'member.deactivated' : 'member.updated',
        entityType: 'user',
        entityId: member.id,
        entityLabel: personLabel(populated),
        summary: deactivated
          ? `Deactivated ${roleWord(member.role)} ${personLabel(populated)}`
          : `Updated ${roleWord(member.role)} ${personLabel(populated)}: ${memberChanges.map((c) => c.label.toLowerCase()).join(', ')}`,
        changes: memberChanges,
        metadata: { role: member.role },
      });
    }

    emitWorkforceUpdate({ type: 'updated' });
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

    await prisma.user.update({
      where: { id: member.id },
      data: { isActive: false, pushToken: null, webPushSubscriptions: { deleteMany: {} } },
    });

    await recordAudit(req, {
      action: 'member.deactivated',
      entityType: 'user',
      entityId: member.id,
      entityLabel: personLabel(member),
      summary: `Deactivated ${roleWord(member.role)} ${personLabel(member)}`,
      changes: [{ field: 'status', label: 'Status', from: member.isActive ? 'Active' : 'Inactive', to: 'Inactive' }],
      metadata: { role: member.role },
    });

    emitWorkforceUpdate({ type: 'deactivated' });
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
    const createdIds = [];
    // Generated temporary passwords, returned once for HR to hand out.
    const credentials = [];
    const errors = [];

    for (const row of rows) {
      try {
        if (!row.employeeId) throw new Error('Employee ID is required');
        if (!row.name) throw new Error('Name is required');
        if (row.password && row.password.length < 6) throw new Error('Password must be at least 6 characters (or leave it blank to generate one)');

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

        const rowTemp = await tempPasswordData('new_account', row.password || undefined);
        await prisma.user.create({
          data: {
            employeeId: normalizedId,
            name: row.name,
            phone: row.phone || '',
            email: row.email || null,
            ...rowTemp.data,
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
        createdIds.push(normalizedId);
        credentials.push({
          row: row.rowNumber,
          employeeId: normalizedId,
          name: row.name,
          temporaryPassword: row.password ? null : rowTemp.plain,
          expiresAt: rowTemp.expiresAt,
        });
      } catch (err) {
        const message = err.code === 'P2002' ? 'Duplicate value (employee ID or email already used)' : err.message;
        errors.push({ row: row.rowNumber, employeeId: row.employeeId, message });
      }
    }

    await recordAudit(req, {
      action: 'member.bulk_imported',
      entityType: 'plant',
      entityId: dept.id,
      entityLabel: `${dept.name} (${dept.code})`,
      summary: `Imported ${created} worker(s) into ${dept.name} (${dept.code}) from Excel${errors.length ? `; ${errors.length} row(s) skipped` : ''}`,
      metadata: {
        fileName: req.file.originalname,
        rows: rows.length,
        created,
        skipped: errors.length,
        createdEmployeeIds: createdIds.slice(0, 1000),
        skippedRows: errors.slice(0, 200),
      },
    });

    if (created > 0) emitWorkforceUpdate({ type: 'imported', count: created });
    res.json({
      success: true,
      message: `${created} worker(s) created${errors.length ? `, ${errors.length} row(s) skipped` : ''}`,
      data: { created, failed: errors.length, errors, credentials },
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

// An admin creates a Staff or Admin login. No password is set here: the person
// receives an invitation email and sets their own (see staff-invite.service),
// so nobody else ever knows it.
exports.createHrAdmin = async (req, res, next) => {
  try {
    const { employeeId, name, email, phone, role } = req.body;

    if (!ASSIGNABLE_STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be Staff or Admin' });
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
        // A random password nobody knows — sign-in is impossible until the
        // invited person sets their own.
        password: await hashPassword(crypto.randomBytes(32).toString('hex')),
        role,
        mustSetPassword: true,
        invitedAt: new Date(),
      },
    });

    const emailSent = await emailStaffInvite(req, admin);

    await recordAudit(req, {
      action: 'account.staff_created',
      entityType: 'user',
      entityId: admin.id,
      entityLabel: personLabel(admin),
      summary: `Created ${roleName(role)} login for ${personLabel(admin)} and ${emailSent ? 'emailed' : 'could not email'} an invitation to ${normalizedEmail}`,
      metadata: { role, invitationEmailed: emailSent },
    });

    emitStaffUpdate({ userId: admin.id, type: 'invited' });
    res.status(201).json({
      success: true,
      message: emailSent
        ? `Invitation sent to ${normalizedEmail}`
        : 'Login created, but the invitation email could not be sent. Use “Resend invitation”.',
      data: { ...formatHrUser(admin), invitationEmailed: emailSent },
    });
  } catch (error) {
    next(error);
  }
};

// Sends a fresh invitation link (e.g. the first email was lost or expired).
// Bumping tokenVersion cancels every earlier link.
exports.resendStaffInvite = async (req, res, next) => {
  try {
    const target = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: HR_ROLES } } });
    if (!target) return res.status(404).json({ success: false, message: 'Login not found' });
    if (!target.mustSetPassword) {
      return res.status(400).json({ success: false, message: 'This person has already set their password.' });
    }
    if (!target.isActive) {
      return res.status(400).json({ success: false, message: 'Reactivate this login before sending an invitation.' });
    }

    const refreshed = await prisma.user.update({
      where: { id: target.id },
      data: { tokenVersion: { increment: 1 }, invitedAt: new Date() },
    });
    const emailSent = await emailStaffInvite(req, refreshed);

    await recordAudit(req, {
      action: 'account.invite_resent',
      entityType: 'user',
      entityId: target.id,
      entityLabel: personLabel(target),
      summary: emailSent
        ? `Resent the invitation to ${personLabel(target)} at ${target.email} (earlier links no longer work)`
        : `Tried to resend the invitation to ${personLabel(target)}, but the email could not be sent`,
      metadata: { invitationEmailed: emailSent },
    });

    if (!emailSent) {
      return res.status(502).json({ success: false, message: 'The invitation email could not be sent. Check the email settings and try again.' });
    }
    emitStaffUpdate({ userId: target.id, type: 'invite_resent' });
    res.json({ success: true, message: `New invitation sent to ${target.email}` });
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
    // A pending self-registration only leaves "pending" through approve or
    // reject — reactivating it here would skip the approval step entirely.
    if (admin.approvalStatus === 'pending') {
      return res.status(400).json({ success: false, message: 'Approve or reject this registration first' });
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

    const updated = await prisma.user.update({ where: { id: admin.id }, data, select: hrUserSelect });
    const staffChanges = diffChanges(
      { name: admin.name, phone: admin.phone || '', status: admin.isActive ? 'Active' : 'Inactive' },
      { name: updated.name, phone: updated.phone || '', status: updated.isActive ? 'Active' : 'Inactive' },
      [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'status', label: 'Status' },
      ]
    );
    if (staffChanges.length) {
      const deactivated = admin.isActive && !updated.isActive;
      await recordAudit(req, {
        action: deactivated ? 'account.staff_deactivated' : 'account.staff_updated',
        entityType: 'user',
        entityId: admin.id,
        entityLabel: personLabel(updated),
        summary: deactivated
          ? `Deactivated ${roleName(updated.role)} login ${personLabel(updated)}`
          : `Updated ${roleName(updated.role)} login ${personLabel(updated)}: ${staffChanges.map((c) => c.label.toLowerCase()).join(', ')}`,
        changes: staffChanges,
        metadata: { role: updated.role },
      });
    }
    emitStaffUpdate({ userId: admin.id, type: 'updated' });
    res.json({ success: true, message: 'Login updated', data: formatHrUser(updated) });
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
    if (admin.approvalStatus === 'pending') {
      return res.status(400).json({ success: false, message: 'Approve or reject this registration first' });
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

    await recordAudit(req, {
      action: 'account.staff_deactivated',
      entityType: 'user',
      entityId: admin.id,
      entityLabel: personLabel(admin),
      summary: `Deactivated ${roleName(admin.role)} login ${personLabel(admin)}`,
      changes: [{ field: 'status', label: 'Status', from: admin.isActive ? 'Active' : 'Inactive', to: 'Inactive' }],
      metadata: { role: admin.role },
    });

    emitStaffUpdate({ userId: admin.id, type: 'deactivated' });
    res.json({ success: true, message: 'Login deactivated' });
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
    await recordAudit(req, {
      action: 'export.downloaded',
      entityType: 'poll',
      entityId: poll.id,
      entityLabel: pollLabel(poll),
      summary: `Downloaded the poll report (Excel) for ${pollLabel(poll)}`,
      metadata: { report: 'poll_report', format: 'xlsx', fileName: filename, rows: summary.totalWorkers },
    });
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
    await recordAudit(req, {
      action: 'export.downloaded',
      entityType: 'poll',
      entityId: poll.id,
      entityLabel: pollLabel(poll),
      summary: `Downloaded the poll report (PDF) for ${pollLabel(poll)}`,
      metadata: { report: 'poll_report', format: 'pdf', fileName: filename, rows: summary.totalWorkers },
    });
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
    await recordAudit(req, {
      action: 'export.downloaded',
      entityType: 'report',
      entityLabel: 'Manpower plan',
      summary: `Downloaded the manpower plan (Excel)${fromDate || toDate ? ` for ${fromDate || '…'} to ${toDate || '…'}` : ''}`,
      metadata: { report: 'manpower_plan', format: 'xlsx', status: where.status, fromDate: fromDate || null, toDate: toDate || null, rows: rows.length },
    });
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
    await recordAudit(req, {
      action: 'export.downloaded',
      entityType: 'plant',
      entityId: dept.id,
      entityLabel: `${dept.name} (${dept.code})`,
      summary: `Downloaded the daily shifts workbook for ${dept.name} (${dept.code}), ${date}`,
      metadata: { report: 'daily_shifts', format: 'xlsx', date },
    });
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

    const passwordHistory = await passwordHistoryFor(worker.id);

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
        passwordHistory,
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

    const previousFollowUp = await prisma.followUp.findUnique({
      where: { workerId_pollId: { workerId, pollId } },
      select: { status: true, note: true },
    });

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

    const followUpLabel = (s) =>
      ({ pending: 'Pending', contacted: 'Contacted', confirmed_coming: 'Confirmed coming', confirmed_not_coming: 'Confirmed not coming' })[s] || null;
    const followUpPoll = await prisma.poll.findUnique({ where: { id: pollId }, include: { department: true } });
    await recordAudit(req, {
      action: 'follow_up.updated',
      entityType: 'poll',
      entityId: pollId,
      entityLabel: followUpPoll ? pollLabel(followUpPoll) : null,
      summary: `Follow-up for ${personLabel(worker)}: ${followUpLabel(status).toLowerCase()}`,
      changes: diffChanges(
        { status: followUpLabel(previousFollowUp?.status) ?? 'None', note: previousFollowUp?.note || '' },
        { status: followUpLabel(status), note: note || '' },
        [
          { key: 'status', label: 'Status' },
          { key: 'note', label: 'Note' },
        ]
      ),
      metadata: { workerId, workerEmployeeId: worker.employeeId },
    });

    res.json({ success: true, message: 'Follow-up updated', data: record });
  } catch (error) {
    next(error);
  }
};

// Sends a free-text notification from HR to workers' phones (browser /
// installed web app and the Android APK) — for demos and announcements.
// Goes to every channel each targeted worker has; workers who never turned
// notifications on are counted but can't be reached.
exports.sendWorkerNotification = async (req, res, next) => {
  try {
    const { target, departmentId, employeeId, title, message } = req.body;
    const where = { role: 'worker', isActive: true };
    let targetLabel = 'all workers';

    if (target === 'plant') {
      if (!departmentId) return res.status(400).json({ success: false, message: 'Choose a plant' });
      const dept = await prisma.department.findFirst({ where: { id: departmentId, isActive: true }, select: { name: true } });
      if (!dept) return res.status(404).json({ success: false, message: 'Plant not found' });
      where.departmentId = departmentId;
      targetLabel = `workers of ${dept.name}`;
    } else if (target === 'worker') {
      const id = String(employeeId || '').trim().toUpperCase();
      if (!id) return res.status(400).json({ success: false, message: 'Enter the worker’s Employee ID' });
      const worker = await prisma.user.findFirst({ where: { ...where, employeeId: id }, select: { id: true, name: true } });
      if (!worker) return res.status(404).json({ success: false, message: `No active worker with Employee ID ${id}` });
      where.id = worker.id;
      targetLabel = `${worker.name} (${id})`;
    }

    const result = await notifyUsers(where, {
      title,
      body: message,
      data: { type: 'hr_message' },
      url: '/home',
      tag: `hr-message-${Date.now()}`,
      ttlSeconds: 12 * 60 * 60,
    });

    await recordAudit(req, {
      action: 'notification.sent',
      entityType: target === 'worker' ? 'user' : target === 'plant' ? 'plant' : 'workers',
      entityId: target === 'worker' ? where.id : target === 'plant' ? departmentId : null,
      entityLabel: targetLabel,
      summary: `Sent "${title}" to ${targetLabel}`,
      metadata: {
        target,
        title,
        message,
        workers: result.teamSize,
        reachable: result.targeted,
        devicesSent: result.sent,
        devicesFailed: result.failed,
      },
    });

    logger.info('push.hr_message_sent', {
      target,
      teamSize: result.teamSize,
      reachable: result.targeted,
      sent: result.sent,
      failed: result.failed,
    });

    res.json({
      success: true,
      message: result.sent > 0 ? `Sent to ${targetLabel}` : `Nobody in ${targetLabel} has notifications turned on`,
      data: {
        targetLabel,
        workers: result.teamSize,
        reachable: result.targeted,
        devicesSent: result.sent,
        devicesFailed: result.failed,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin-only: permanent deletes and bulk actions
// ---------------------------------------------------------------------------

// Permanently removes a Staff/Admin login. For people who should never have
// had access (wrong person invited, test account); someone who simply left
// is usually better deactivated, which keeps their name on past actions.
// Their earlier actions stay in the audit log either way.
exports.deleteHrAdmin = async (req, res, next) => {
  try {
    const target = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: HR_ROLES } } });
    if (!target) return res.status(404).json({ success: false, message: 'Login not found' });
    if (target.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own login' });
    }
    if (['admin', 'superadmin'].includes(target.role) && target.isActive) {
      const otherAdmins = await prisma.user.count({
        where: { id: { not: target.id }, role: { in: ['admin', 'superadmin'] }, isActive: true, mustSetPassword: false },
      });
      if (otherAdmins === 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last active admin' });
      }
    }

    await prisma.user.delete({ where: { id: target.id } });

    await recordAudit(req, {
      action: 'account.staff_deleted',
      entityType: 'user',
      entityId: target.id,
      entityLabel: personLabel(target),
      summary: `Permanently deleted the ${roleName(target.role)} login of ${personLabel(target)} (${target.email})`,
      metadata: { role: target.role, email: target.email, wasActive: target.isActive, invitePending: target.mustSetPassword },
    });
    emitStaffUpdate({ userId: target.id, type: 'deleted' });

    res.json({ success: true, message: `${target.name}'s login was deleted` });
  } catch (error) {
    next(error);
  }
};

const BULK_VERBS = {
  deactivate: 'deactivated',
  reactivate: 'reactivated',
  delete: 'deleted',
  require_password_change: 'asked for a new password',
};

// Deactivate / reactivate / permanently delete selected workers and
// incharges. Each person is handled on their own and reported back as done
// or skipped (with the reason), so one problem never blocks the rest.
// Workers go first, so an incharge whose remaining active workers are all in
// the same selection can be deactivated/deleted in the same go.
exports.bulkTeamAction = async (req, res, next) => {
  try {
    const { action } = req.body;
    const ids = [...new Set(req.body.ids)];
    const people = await prisma.user.findMany({
      where: { id: { in: ids }, role: { in: ['worker', 'incharge'] } },
      select: personSelect,
    });
    const found = new Set(people.map((p) => p.id));
    const done = [];
    const skipped = ids.filter((id) => !found.has(id)).map((id) => ({ id, name: null, reason: 'Not found (already deleted?)' }));
    const ordered = [...people].sort((a, b) => (a.role === b.role ? 0 : a.role === 'worker' ? -1 : 1));

    for (const person of ordered) {
      const who = { id: person.id, name: person.name, employeeId: person.employeeId, role: person.role };
      try {
        if (action === 'require_password_change') {
          if (!person.isActive) {
            skipped.push({ ...who, reason: 'Inactive' });
            continue;
          }
          if (person.mustChangePassword) {
            skipped.push({ ...who, reason: 'Already has to set a new password' });
            continue;
          }
          await prisma.user.update({ where: { id: person.id }, data: { mustChangePassword: true, tempPasswordExpiresAt: null } });
        } else if (action === 'reactivate') {
          if (person.isActive) {
            skipped.push({ ...who, reason: 'Already active' });
            continue;
          }
          if (person.department && person.department.isActive === false) {
            skipped.push({ ...who, reason: `Plant ${person.department.code} is deactivated` });
            continue;
          }
          await prisma.user.update({ where: { id: person.id }, data: { isActive: true } });
        } else {
          if (action === 'deactivate' && !person.isActive) {
            skipped.push({ ...who, reason: 'Already inactive' });
            continue;
          }
          if (person.role === 'incharge') {
            const activeReports = await prisma.user.count({ where: { inchargeId: person.id, role: 'worker', isActive: true } });
            if (activeReports > 0) {
              skipped.push({ ...who, reason: `${activeReports} active worker(s) still report to them — reassign them, or select them too` });
              continue;
            }
          }
          if (action === 'deactivate') {
            await prisma.user.update({
              where: { id: person.id },
              data: { isActive: false, pushToken: null, webPushSubscriptions: { deleteMany: {} } },
            });
          } else {
            // Their poll answers and follow-ups go with them (they can't
            // exist without the person); polls they created and follow-ups
            // they updated just lose the link (onDelete: SetNull).
            await prisma.$transaction([
              prisma.followUp.deleteMany({ where: { workerId: person.id } }),
              prisma.response.deleteMany({ where: { userId: person.id } }),
              prisma.user.delete({ where: { id: person.id } }),
            ]);
          }
        }

        const snapshot = memberSnapshot(person);
        await recordAudit(req, {
          action:
            action === 'delete'
              ? 'member.deleted'
              : action === 'reactivate'
                ? 'member.reactivated'
                : action === 'require_password_change'
                  ? 'member.password_change_required'
                  : 'member.deactivated',
          entityType: 'user',
          entityId: person.id,
          entityLabel: personLabel(person),
          summary:
            action === 'delete'
              ? `Permanently deleted ${roleWord(person.role)} ${personLabel(person)} (${snapshot.plant}) and their attendance answers`
              : action === 'require_password_change'
                ? `Required ${roleWord(person.role)} ${personLabel(person)} to set a new password at next sign-in`
                : `${action === 'reactivate' ? 'Reactivated' : 'Deactivated'} ${roleWord(person.role)} ${personLabel(person)}`,
          changes:
            action === 'delete'
              ? diffChanges(snapshot, {}, MEMBER_AUDIT_FIELDS.filter((f) => f.key !== 'password'))
              : action === 'require_password_change'
                ? []
                : [{ field: 'status', label: 'Status', from: action === 'reactivate' ? 'Inactive' : 'Active', to: action === 'reactivate' ? 'Active' : 'Inactive' }],
          metadata: { role: person.role, bulk: ids.length > 1 },
        });
        done.push(who);
      } catch (error) {
        logger.error('team.bulk_item_failed', { action, userId: person.id, error: error.message });
        skipped.push({ ...who, reason: 'Could not be updated — try again' });
      }
    }

    if (done.length) emitWorkforceUpdate({ type: BULK_VERBS[action], count: done.length });

    const verb = BULK_VERBS[action];
    res.json({
      success: true,
      message: `${done.length} ${done.length === 1 ? 'person' : 'people'} ${verb}${skipped.length ? `, ${skipped.length} skipped` : ''}`,
      data: { action, done, skipped },
    });
  } catch (error) {
    next(error);
  }
};

// HR/admin: give a worker or incharge a new temporary password (they forgot
// theirs). Valid 24 hours; signs them out everywhere; they must set their own
// at the next sign-in. Shown once in the response, never stored readable.
exports.resetTeamMemberPassword = async (req, res, next) => {
  try {
    const member = await prisma.user.findFirst({
      where: { id: req.params.id, role: { in: ['worker', 'incharge', 'supervisor'] } },
      select: personSelect,
    });
    if (!member) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (!member.isActive) {
      return res.status(400).json({ success: false, message: 'Reactivate this person before resetting their password.' });
    }

    const temp = await tempPasswordData('reset');
    await prisma.user.update({
      where: { id: member.id },
      data: { ...temp.data, tokenVersion: { increment: 1 } },
    });

    await recordAudit(req, {
      action: 'member.password_reset',
      entityType: 'user',
      entityId: member.id,
      entityLabel: personLabel(member),
      summary: `Issued a temporary password to ${roleWord(member.role)} ${personLabel(member)} (valid 24 hours; signed out everywhere)`,
      changes: [{ field: 'password', label: 'Password', from: null, to: null, note: 'changed' }],
      metadata: { role: member.role, expiresAt: temp.expiresAt },
    });
    emitWorkforceUpdate({ type: 'password_reset' });

    res.json({
      success: true,
      message: `Temporary password created for ${member.name}`,
      data: { temporaryPassword: temp.plain, expiresAt: temp.expiresAt, name: member.name, employeeId: member.employeeId },
    });
  } catch (error) {
    next(error);
  }
};

// Admin: everyone in a plant (or everywhere) must set a new password at their
// next sign-in — e.g. to get rid of a shared default password. Their current
// password keeps working only to sign in and set the new one.
exports.requirePasswordChange = async (req, res, next) => {
  try {
    const { scope, departmentId } = req.body;
    const where = { role: { in: ['worker', 'incharge', 'supervisor'] }, isActive: true, mustChangePassword: false };
    let scopeLabel = 'everyone';
    if (scope === 'plant') {
      if (!departmentId) return res.status(400).json({ success: false, message: 'Choose a plant' });
      const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true, code: true } });
      if (!dept) return res.status(404).json({ success: false, message: 'Plant not found' });
      where.departmentId = departmentId;
      scopeLabel = `everyone in ${dept.name} (${dept.code})`;
    }

    const { count } = await prisma.user.updateMany({
      where,
      data: { mustChangePassword: true, tempPasswordExpiresAt: null },
    });

    await recordAudit(req, {
      action: 'member.password_change_required',
      entityType: scope === 'plant' ? 'plant' : 'workers',
      entityId: scope === 'plant' ? departmentId : null,
      entityLabel: scopeLabel,
      summary: `Required a new password at next sign-in for ${scopeLabel} (${count} account${count === 1 ? '' : 's'})`,
      metadata: { scope, count },
    });
    if (count) emitWorkforceUpdate({ type: 'password_change_required', count });

    res.json({
      success: true,
      message: count
        ? `${count} ${count === 1 ? 'person' : 'people'} will be asked for a new password at their next sign-in`
        : 'Everyone in this group already has to set a new password',
      data: { count },
    });
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
    await recordAudit(req, {
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
      entityLabel: personLabel(user),
      summary: `${user.name} changed their password`,
      changes: [{ field: 'password', label: 'Password', from: null, to: null, note: 'changed' }],
    });
    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    next(error);
  }
};
