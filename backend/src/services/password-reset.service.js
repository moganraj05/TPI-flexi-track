const crypto = require('crypto');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { notifyUsers } = require('./notification.service');
const { emitResetRequestUpdate } = require('../realtime');
const { recordAudit, personLabel } = require('./audit.service');

// Worker-app "Forgot password?" requests.
//
// A worker (or incharge) who can't sign in asks for help from the login
// page with their Employee ID + the last 4 digits of the phone number on
// file. The request goes to whoever can confirm who they are (its "level"):
//   incharge   - a worker's own (active) incharge
//   supervisor - the plant's supervisors (no active incharge, or an incharge asking)
//   staff      - HR / admin in the staff console (a supervisor asking, or a
//                plant with no active supervisor)
// They call the person, then issue a temporary password (incharge app
// Requests tab, or the staff console's Password requests page) or reject it.
// Nobody acting within ESCALATE_AFTER moves it up one level; HR/admin can
// handle any request at any time. One open request per person; asking again
// refreshes it. Signing in normally cancels it; nobody acting within
// REQUEST_TTL lets it expire.

const HOUR = 60 * 60 * 1000;
const REQUEST_TTL_MS = 48 * HOUR;
const ESCALATE_AFTER_MS = (Number(process.env.RESET_REQUEST_ESCALATE_HOURS) || 12) * HOUR;
// Max new/refreshed requests per person per day — stops someone flooding an
// incharge with notifications using a known Employee ID.
const DAILY_LIMIT = 3;
// Asking again within this window updates the request but doesn't notify
// the handlers again.
const RENOTIFY_AFTER_MS = 30 * 60 * 1000;

const WORKER_APP_ROLES = ['worker', 'incharge', 'supervisor'];
const STAFF_ROLES = ['hr', 'admin', 'superadmin'];
const SYSTEM_ACTOR = { name: 'FlexiTrack (automatic)', role: 'system' };

const isStaff = (user) => !!user && STAFF_ROLES.includes(user.role);

// Pending requests whose time ran out become "expired" — checked on every
// read and by the background job, and recorded in the audit log once.
async function expireStale(where = {}) {
  const stale = await prisma.passwordResetRequest.findMany({
    where: { ...where, status: 'pending', expiresAt: { lte: new Date() } },
    select: { id: true, departmentId: true, level: true, user: { select: { id: true, name: true, employeeId: true } } },
    take: 200,
  });
  for (const r of stale) {
    const { count } = await prisma.passwordResetRequest.updateMany({
      where: { id: r.id, status: 'pending' },
      data: { status: 'expired', handledAt: new Date() },
    });
    if (!count) continue;
    await recordAudit(null, {
      action: 'auth.reset_request_expired',
      entityType: 'user',
      entityId: r.user.id,
      entityLabel: personLabel(r.user),
      summary: `${personLabel(r.user)}'s password reset request expired — nobody acted within 48 hours`,
      metadata: { requestId: r.id, level: r.level },
      actor: SYSTEM_ACTOR,
    });
    emitResetRequestUpdate({ departmentId: r.departmentId });
  }
  return stale.length;
}

// Is there an active supervisor (other than the person asking) to send it to?
async function plantHasSupervisor(departmentId, exceptUserId) {
  if (!departmentId) return false;
  const count = await prisma.user.count({
    where: { departmentId, role: 'supervisor', isActive: true, id: { not: exceptUserId } },
  });
  return count > 0;
}

// Prisma `where` for the worker-app people who should be told about a request.
function appHandlersWhere(request) {
  if (request.level === 'incharge' && request.routedToId) return { id: request.routedToId, isActive: true };
  if (request.level === 'supervisor') {
    return { departmentId: request.departmentId, role: 'supervisor', isActive: true, id: { not: request.userId } };
  }
  return null;
}

// Can this signed-in person see and act on the request? (`request.user`
// must be loaded.) HR / admin: any request. Incharge: requests sent to
// them. Supervisor: also everyone in their plant except other supervisors.
function canHandle(handler, request) {
  if (!handler || handler.id === request.userId) return false;
  if (isStaff(handler)) return true;
  if (request.routedToId === handler.id) return true;
  return (
    handler.role === 'supervisor' &&
    !!request.departmentId &&
    handler.departmentId === request.departmentId &&
    request.user?.role !== 'supervisor'
  );
}

// The requests an incharge/supervisor sees in their Requests tab.
function visibleWhere(handler) {
  const or = [{ routedToId: handler.id }];
  if (handler.role === 'supervisor' && handler.departmentId) {
    or.push({ departmentId: handler.departmentId, user: { role: { not: 'supervisor' } } });
  }
  return { OR: or, userId: { not: handler.id } };
}

async function notifyHandlers(request, person, { escalated = false } = {}) {
  try {
    const appWhere = appHandlersWhere(request);
    const intro = escalated ? 'Waiting over 12 hours: ' : '';
    if (appWhere) {
      await notifyUsers(appWhere, {
        title: escalated ? 'Password reset request — still waiting' : 'Password reset request',
        body: `${intro}${person.name} (${person.employeeId}) can't sign in. Call them, then reset their password in FlexiTrack.`,
        data: { type: 'reset_request', requestId: request.id },
        url: '/incharge/requests',
        tag: `reset-${request.id}`,
        ttlSeconds: 12 * 60 * 60,
      });
    } else {
      // Staff console: a live badge on "Password requests", plus a push to
      // any HR/admin browser that turned notifications on.
      await notifyUsers(
        { role: { in: STAFF_ROLES }, isActive: true },
        {
          title: 'Password reset request for HR',
          body: `${intro}${person.name} (${person.employeeId}) can't sign in. Call them, then reset their password in the staff console.`,
          data: { type: 'reset_request', requestId: request.id },
          url: '/staff/app/password-requests',
          tag: `reset-${request.id}`,
          ttlSeconds: 12 * 60 * 60,
        }
      );
    }
    await prisma.passwordResetRequest.update({ where: { id: request.id }, data: { notifiedAt: new Date() } });
  } catch (error) {
    logger.error('reset_request.notify_failed', { requestId: request.id, error: error.message });
  }
}

const LEVEL_PHRASE = {
  incharge: 'their incharge',
  supervisor: "the plant's supervisors",
  staff: 'HR / admin',
};

const lastFour = (value) => String(value || '').replace(/\D/g, '').slice(-4);

// Called by the public POST /api/auth/forgot-password. Never reveals whether
// the account exists or the phone digits matched — the caller always gets
// the same answer; every outcome is only logged.
async function submitResetRequest(req, { employeeId, phoneLast4 }) {
  const id = String(employeeId || '').trim().toUpperCase();
  const user = await prisma.user.findUnique({
    where: { employeeId: id },
    select: { id: true, name: true, employeeId: true, phone: true, role: true, isActive: true, departmentId: true, inchargeId: true },
  });

  if (!user || !user.isActive || !WORKER_APP_ROLES.includes(user.role)) {
    logger.warn('reset_request.ignored', { employeeId: id, reason: 'no_active_worker_app_account' });
    return;
  }
  // When a phone number is on file, its last 4 digits must match.
  if (lastFour(user.phone).length === 4 && lastFour(user.phone) !== String(phoneLast4)) {
    logger.warn('reset_request.ignored', { userId: user.id, reason: 'phone_digits_mismatch' });
    return;
  }

  await expireStale({ userId: user.id });
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * HOUR);
  const recent = await prisma.passwordResetRequest.findMany({
    where: { userId: user.id, lastRequestedAt: { gt: dayAgo } },
    select: { requestCount: true },
  });
  const askedToday = recent.reduce((n, r) => n + Math.min(r.requestCount, DAILY_LIMIT), 0);
  if (askedToday >= DAILY_LIMIT) {
    logger.warn('reset_request.ignored', { userId: user.id, reason: 'daily_limit' });
    return;
  }

  const meta = {
    requestIp: String(req.ip || '').slice(0, 100) || null,
    userAgent: String(req.get('user-agent') || '').slice(0, 300) || null,
  };
  const open = await prisma.passwordResetRequest.findFirst({ where: { userId: user.id, status: 'pending' } });

  let request;
  if (open) {
    request = await prisma.passwordResetRequest.update({
      where: { id: open.id },
      data: { ...meta, lastRequestedAt: now, requestCount: { increment: 1 }, expiresAt: new Date(now.getTime() + REQUEST_TTL_MS) },
    });
  } else {
    // A worker goes to their own incharge when that incharge can act on it.
    let routedToId = null;
    if (user.role === 'worker' && user.inchargeId) {
      const incharge = await prisma.user.findFirst({ where: { id: user.inchargeId, isActive: true }, select: { id: true } });
      routedToId = incharge?.id || null;
    }
    let level = 'incharge';
    if (!routedToId) {
      level = user.role !== 'supervisor' && (await plantHasSupervisor(user.departmentId, user.id)) ? 'supervisor' : 'staff';
    }
    request = await prisma.passwordResetRequest.create({
      data: { ...meta, userId: user.id, departmentId: user.departmentId, routedToId, level, expiresAt: new Date(now.getTime() + REQUEST_TTL_MS) },
    });
  }

  await recordAudit(req, {
    action: 'auth.reset_requested',
    entityType: 'user',
    entityId: user.id,
    entityLabel: personLabel(user),
    summary: open
      ? `${personLabel(user)} asked again for a password reset (${request.requestCount} times)`
      : `${personLabel(user)} asked for a password reset (sent to ${LEVEL_PHRASE[request.level]})`,
    metadata: { requestId: request.id, level: request.level },
    actor: { id: user.id, name: user.name, role: user.role, identifier: user.employeeId },
  });

  if (!request.notifiedAt || now - request.notifiedAt > RENOTIFY_AFTER_MS) await notifyHandlers(request, user);
  emitResetRequestUpdate({ departmentId: request.departmentId });
  logger.info('reset_request.submitted', { requestId: request.id, userId: user.id, level: request.level, refreshed: !!open });
}

// Moves pending requests nobody acted on up one level:
// incharge -> supervisors (or HR when the plant has none) -> HR.
async function escalateOverdue() {
  const cutoff = new Date(Date.now() - ESCALATE_AFTER_MS);
  const overdue = await prisma.passwordResetRequest.findMany({
    where: {
      status: 'pending',
      level: { in: ['incharge', 'supervisor'] },
      OR: [{ escalatedAt: null, createdAt: { lte: cutoff } }, { escalatedAt: { lte: cutoff } }],
    },
    include: { user: { select: { id: true, name: true, employeeId: true, role: true } } },
    take: 200,
  });

  let moved = 0;
  for (const r of overdue) {
    let next = 'staff';
    if (r.level === 'incharge' && r.user.role !== 'supervisor' && (await plantHasSupervisor(r.departmentId, r.userId))) {
      next = 'supervisor';
    }
    const escalatedAt = new Date();
    const { count } = await prisma.passwordResetRequest.updateMany({
      where: { id: r.id, status: 'pending', level: r.level },
      data: { level: next, escalatedAt },
    });
    if (!count) continue;
    moved += 1;

    await recordAudit(null, {
      action: 'auth.reset_request_escalated',
      entityType: 'user',
      entityId: r.user.id,
      entityLabel: personLabel(r.user),
      summary: `${personLabel(r.user)}'s password reset request moved from ${LEVEL_PHRASE[r.level]} to ${LEVEL_PHRASE[next]} — nobody acted within ${Math.round(ESCALATE_AFTER_MS / HOUR)} hours`,
      metadata: { requestId: r.id, from: r.level, to: next },
      actor: SYSTEM_ACTOR,
    });
    await notifyHandlers({ ...r, level: next, escalatedAt }, r.user, { escalated: true });
    emitResetRequestUpdate({ departmentId: r.departmentId });
  }
  return moved;
}

// Background job: expire old requests, move up overdue ones.
function startResetRequestJobs(intervalMs) {
  let running = false;
  let stopped = false;
  let inFlight = Promise.resolve();

  const runTick = () => {
    if (stopped || running) return;
    running = true;
    inFlight = logger.runWithContext({ requestId: `job:reset-requests:${crypto.randomUUID()}` }, async () => {
      try {
        const expired = await expireStale();
        const escalated = await escalateOverdue();
        if (expired || escalated) logger.info('reset_requests.tick', { expired, escalated });
      } catch (err) {
        logger.error('reset_requests.tick_failed', { error: err.message, stack: err.stack });
      } finally {
        running = false;
      }
    });
  };

  runTick();
  const timer = setInterval(runTick, intervalMs);
  logger.info('reset_requests.scheduler_started', { intervalMs, escalateAfterHours: ESCALATE_AFTER_MS / HOUR });
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      return inFlight;
    },
  };
}

// A normal successful sign-in: they remembered — nothing left to do.
async function cancelOnSignIn(userId) {
  const { count } = await prisma.passwordResetRequest.updateMany({
    where: { userId, status: 'pending' },
    data: { status: 'cancelled', handledAt: new Date(), rejectReason: 'Signed in with their password' },
  });
  return count;
}

// The person set their own password after an approved reset.
async function markCompleted(userId) {
  return prisma.passwordResetRequest.updateMany({
    where: { userId, status: 'approved', completedAt: null },
    data: { completedAt: new Date() },
  });
}

module.exports = {
  REQUEST_TTL_MS,
  ESCALATE_AFTER_MS,
  LEVEL_PHRASE,
  isStaff,
  expireStale,
  escalateOverdue,
  startResetRequestJobs,
  canHandle,
  visibleWhere,
  submitResetRequest,
  cancelOnSignIn,
  markCompleted,
};
