const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { formatShiftName } = require('../config/shiftCatalog');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { tempPasswordData } = require('../services/temp-password.service');
const { expireStale, canHandle, visibleWhere, isStaff, LEVEL_PHRASE } = require('../services/password-reset.service');
const { recordAudit, personLabel, roleName } = require('../services/audit.service');
const { emitResetRequestUpdate, emitWorkforceUpdate } = require('../realtime');

// Password reset requests from the worker app's "Forgot password?":
// - incharge app "Requests" tab (/api/incharge/reset-requests): the requests
//   sent to this incharge (or, for a supervisor, their plant);
// - staff console "Password requests" page (/api/hr/reset-requests): every
//   plant; HR/admin can handle any request.
// Approving issues a temporary password (shown once) — the only way an
// incharge can trigger a password change.

const personFields = {
  id: true,
  name: true,
  employeeId: true,
  phone: true,
  role: true,
  isActive: true,
  shiftStart: true,
  shiftEnd: true,
  lastLoginAt: true,
  mustChangePassword: true,
  department: { select: { id: true, code: true, name: true } },
};

const formatRequest = (r, recentCount, handlerNames = new Map()) => ({
  id: r.id,
  status: r.status,
  // An approved request is "completed" once the person set their own password.
  completed: r.status === 'approved' && !!r.completedAt,
  requestCount: r.requestCount,
  createdAt: r.createdAt,
  lastRequestedAt: r.lastRequestedAt,
  expiresAt: r.expiresAt,
  handledAt: r.handledAt,
  handledByName: r.handledByName,
  rejectReason: r.rejectReason,
  completedAt: r.completedAt,
  // Who has it now: incharge | supervisor | staff; escalatedAt = when it
  // last moved up because nobody acted.
  level: r.level,
  levelLabel: LEVEL_PHRASE[r.level],
  escalatedAt: r.escalatedAt,
  routedTo: r.routedToId ? 'incharge' : 'supervisors',
  routedToName: r.routedToId ? handlerNames.get(r.routedToId) || null : null,
  // How many reset requests this person made in the last 30 days — several
  // in a short time is worth a second look.
  recentRequests: recentCount,
  person: r.user
    ? {
        id: r.user.id,
        name: r.user.name,
        employeeId: r.user.employeeId,
        phone: r.user.phone || '',
        role: r.user.role,
        roleLabel: roleName(r.user.role),
        isActive: r.user.isActive,
        shiftLabel: r.user.shiftStart && r.user.shiftEnd ? formatShiftName(r.user.shiftStart, r.user.shiftEnd) : null,
        lastLoginAt: r.user.lastLoginAt,
        department: r.user.department || null,
      }
    : null,
});

async function recentCounts(userIds) {
  if (userIds.length === 0) return new Map();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const groups = await prisma.passwordResetRequest.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, createdAt: { gte: since } },
    _sum: { requestCount: true },
  });
  return new Map(groups.map((g) => [g.userId, g._sum.requestCount || 0]));
}

async function handlerNamesFor(items) {
  const ids = [...new Set(items.map((r) => r.routedToId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

// GET /incharge/reset-requests?status=pending|done
exports.listResetRequests = async (req, res, next) => {
  try {
    const scope = visibleWhere(req.user);
    await expireStale(scope);
    const done = req.query.status === 'done';

    const [items, pendingCount] = await Promise.all([
      prisma.passwordResetRequest.findMany({
        where: { ...scope, status: done ? { not: 'pending' } : 'pending' },
        orderBy: done ? [{ lastRequestedAt: 'desc' }] : [{ lastRequestedAt: 'asc' }],
        take: done ? 50 : 200,
        include: { user: { select: personFields } },
      }),
      prisma.passwordResetRequest.count({ where: { ...scope, status: 'pending' } }),
    ]);

    const counts = await recentCounts([...new Set(items.map((r) => r.userId))]);
    res.json({
      success: true,
      data: items.map((r) => formatRequest(r, counts.get(r.userId) || 0)),
      meta: { pendingCount },
    });
  } catch (error) {
    next(error);
  }
};

// Staff console views: open (every pending request), hr (pending and now
// with HR — the ones nobody else will handle), done (handled / closed).
const HR_VIEWS = {
  open: { status: 'pending' },
  hr: { status: 'pending', level: 'staff' },
  done: { status: { not: 'pending' } },
};

async function hrCounts() {
  const [open, hr] = await Promise.all([
    prisma.passwordResetRequest.count({ where: HR_VIEWS.open }),
    prisma.passwordResetRequest.count({ where: HR_VIEWS.hr }),
  ]);
  return { open, hr };
}

// GET /hr/reset-requests?view=open|hr|done&department=&q=&page=&limit=
exports.listAllResetRequests = async (req, res, next) => {
  try {
    await expireStale();
    const view = HR_VIEWS[req.query.view] ? req.query.view : 'open';
    const where = { ...HR_VIEWS[view] };
    if (req.query.department && req.query.department !== 'all') where.departmentId = String(req.query.department);
    const q = String(req.query.q || '').trim();
    if (q) {
      where.user = {
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { employeeId: { contains: q, mode: 'insensitive' } }],
      };
    }
    const pagination = parsePagination(req.query, { defaultLimit: 25 });

    const [total, items, counts] = await Promise.all([
      prisma.passwordResetRequest.count({ where }),
      prisma.passwordResetRequest.findMany({
        where,
        // Open: the ones with HR first, then the longest waiting.
        orderBy: view === 'done' ? [{ handledAt: 'desc' }, { lastRequestedAt: 'desc' }] : [{ level: 'desc' }, { createdAt: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: { user: { select: personFields } },
      }),
      hrCounts(),
    ]);
    const [recent, names] = await Promise.all([recentCounts([...new Set(items.map((r) => r.userId))]), handlerNamesFor(items)]);

    res.json({
      success: true,
      data: items.map((r) => formatRequest(r, recent.get(r.userId) || 0, names)),
      meta: { ...buildMeta(pagination, total), counts },
    });
  } catch (error) {
    next(error);
  }
};

// GET /hr/reset-requests/summary — the sidebar badge.
exports.resetRequestSummary = async (req, res, next) => {
  try {
    await expireStale();
    res.json({ success: true, data: await hrCounts() });
  } catch (error) {
    next(error);
  }
};

// Loads a request the signed-in handler may act on, still pending.
async function loadPending(req, res) {
  await expireStale({ id: req.params.requestId });
  const request = await prisma.passwordResetRequest.findUnique({
    where: { id: req.params.requestId },
    include: { user: { select: personFields } },
  });
  if (!request || !canHandle(req.user, request)) {
    res.status(404).json({ success: false, message: 'Request not found' });
    return null;
  }
  if (request.status !== 'pending') {
    const already = {
      approved: `Already handled — ${request.handledByName || 'someone'} issued a temporary password.`,
      rejected: `Already rejected by ${request.handledByName || 'someone'}.`,
      expired: 'This request expired. They can ask again from the sign-in page.',
      cancelled: 'They signed in with their password, so this request was cancelled.',
    };
    res.status(409).json({ success: false, message: already[request.status] || 'This request is no longer open.' });
    return null;
  }
  return request;
}

const viaOf = (req) => (isStaff(req.user) ? 'staff_console' : 'incharge_app');

// POST /incharge/reset-requests/:requestId/approve
// POST /hr/reset-requests/:requestId/approve
exports.approveResetRequest = async (req, res, next) => {
  try {
    const request = await loadPending(req, res);
    if (!request) return;
    const person = request.user;
    if (!person.isActive) {
      return res.status(400).json({ success: false, message: `${person.name}'s account is deactivated — ask HR.` });
    }

    const temp = await tempPasswordData('reset');
    // Claim the request first (conditionally, so two people approving at once
    // can't both issue a password); the password only changes if the claim
    // succeeded — both in one transaction.
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetRequest.updateMany({
        where: { id: request.id, status: 'pending' },
        data: { status: 'approved', handledById: req.user.id, handledByName: req.user.name, handledAt: new Date() },
      });
      if (count !== 1) return false;
      await tx.user.update({ where: { id: person.id }, data: { ...temp.data, tokenVersion: { increment: 1 } } });
      return true;
    });
    if (!claimed) {
      return res.status(409).json({ success: false, message: 'Someone else just handled this request.' });
    }

    await recordAudit(req, {
      action: 'auth.reset_request_approved',
      entityType: 'user',
      entityId: person.id,
      entityLabel: personLabel(person),
      summary: `Approved ${personLabel(person)}'s password reset request and issued a temporary password (valid 24 hours)`,
      changes: [{ field: 'password', label: 'Password', from: null, to: null, note: 'changed' }],
      metadata: { requestId: request.id, expiresAt: temp.expiresAt, via: viaOf(req) },
    });
    emitResetRequestUpdate({ departmentId: request.departmentId });
    emitWorkforceUpdate({ type: 'password_reset' });
    logger.info('reset_request.approved', { requestId: request.id, userId: person.id, via: viaOf(req) });

    res.json({
      success: true,
      message: `Temporary password created for ${person.name}`,
      data: {
        name: person.name,
        employeeId: person.employeeId,
        temporaryPassword: temp.plain,
        temporaryPasswordExpiresAt: temp.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /incharge/reset-requests/:requestId/reject { reason }
// POST /hr/reset-requests/:requestId/reject { reason }
exports.rejectResetRequest = async (req, res, next) => {
  try {
    const request = await loadPending(req, res);
    if (!request) return;
    const reason = req.body.reason.trim();

    const { count } = await prisma.passwordResetRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: 'rejected', handledById: req.user.id, handledByName: req.user.name, handledAt: new Date(), rejectReason: reason },
    });
    if (count !== 1) return res.status(409).json({ success: false, message: 'Someone else just handled this request.' });

    await recordAudit(req, {
      action: 'auth.reset_request_rejected',
      entityType: 'user',
      entityId: request.user.id,
      entityLabel: personLabel(request.user),
      summary: `Rejected ${personLabel(request.user)}'s password reset request: ${reason}`,
      metadata: { requestId: request.id, reason, via: viaOf(req) },
    });
    emitResetRequestUpdate({ departmentId: request.departmentId });

    res.json({ success: true, message: 'Request rejected' });
  } catch (error) {
    next(error);
  }
};

// Every password event for one worker/incharge, newest first — the
// "Password history" card on their staff console page.
const PASSWORD_ACTIONS = [
  'member.created',
  'member.password_reset',
  'member.password_change_required',
  'auth.worker_password_changed',
  'auth.reset_requested',
  'auth.reset_request_approved',
  'auth.reset_request_rejected',
  'auth.reset_request_escalated',
  'auth.reset_request_expired',
];

async function passwordHistoryFor(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordChangedAt: true, mustChangePassword: true, tempPasswordExpiresAt: true, lastLoginAt: true },
  });
  if (!user) return null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, openRequest, recentRequests] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType: 'user', entityId: user.id, action: { in: PASSWORD_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, action: true, summary: true, actorName: true, actorRole: true, createdAt: true },
    }),
    prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
      select: { id: true, level: true, createdAt: true, escalatedAt: true },
    }),
    prisma.passwordResetRequest.aggregate({
      where: { userId: user.id, createdAt: { gte: since } },
      _sum: { requestCount: true },
    }),
  ]);
  return {
    passwordChangedAt: user.passwordChangedAt,
    mustChangePassword: user.mustChangePassword,
    tempPasswordExpiresAt: user.tempPasswordExpiresAt,
    lastLoginAt: user.lastLoginAt,
    openRequest: openRequest ? { ...openRequest, levelLabel: LEVEL_PHRASE[openRequest.level] } : null,
    requestsLast30Days: recentRequests._sum.requestCount || 0,
    events,
  };
}
exports.passwordHistoryFor = passwordHistoryFor;
