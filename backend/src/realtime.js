const { Server } = require('socket.io');
const { verifyToken, isSessionRevoked } = require('./utils/jwt');
const prisma = require('./config/prisma');
const { corsOptions } = require('./config/cors');
const logger = require('./utils/logger');

// Same HR role set as hr.controller.js — duplicated here (rather than imported)
// to keep this module dependency-free of the controllers, since controllers
// require *this* module to emit events.
const HR_ROLES = ['hr', 'admin', 'superadmin'];

let io = null;

// One Socket.IO server shared by every client (web + mobile). Auth mirrors
// middleware/auth.js exactly — same token, same tokenVersion revocation check
// — but runs once at connection time instead of per-request, since a socket
// is a long-lived connection rather than a request/response pair.
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    // Same allowlist the REST API enforces (backend/src/config/cors.js) —
    // sockets carry the same Bearer token as REST, so there's no reason for
    // this transport to be more permissive about who can even attempt the
    // handshake.
    cors: corsOptions,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.id } });

      if (!user || !user.isActive) {
        logger.warn('realtime.auth_failed', { reason: 'inactive_or_missing_account', userId: decoded.id });
        return next(new Error('Invalid or inactive account'));
      }
      if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
        logger.warn('realtime.auth_failed', { reason: 'token_revoked', userId: user.id });
        return next(new Error('Session expired, please log in again'));
      }
      if (await isSessionRevoked(decoded)) {
        logger.warn('realtime.auth_failed', { reason: 'session_logged_out', userId: user.id });
        return next(new Error('Session expired, please log in again'));
      }

      socket.user = user;
      next();
    } catch {
      logger.warn('realtime.auth_failed', { reason: 'invalid_or_expired_token' });
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    // Rooms: a personal room for future targeted messages, a department room
    // for worker/incharge clients (mobile), and a shared "hr" room for every
    // HR/admin/superadmin client (web) regardless of department.
    socket.join(`user:${user.id}`);
    // HR users can carry a plant too (recorded at self-registration), but
    // they already get every department's events through the "hr" room —
    // joining the department room as well would deliver each event twice.
    if (HR_ROLES.includes(user.role)) socket.join('hr');
    else if (user.departmentId) socket.join(`dept:${user.departmentId}`);

    logger.info('realtime.connected', { socketId: socket.id, userId: user.id, role: user.role });

    // Cheap breadcrumb for diagnosing reconnect storms/flapping clients in
    // production logs — no per-connection state kept beyond what socket.io
    // itself already tracks.
    socket.on('disconnect', (reason) => {
      logger.info('realtime.disconnected', { socketId: socket.id, userId: user.id, reason });
    });
  });

  logger.info('realtime.ready', {});
  return io;
}

// Poll data (a response recorded, attendance marked, a poll opened/closed)
// changed for one department. Reaches that department's mobile clients
// (worker + incharge) and every HR web client, since HR views span all
// departments.
function emitPollUpdate({ pollId, departmentId, workerId = null, type = 'updated' }) {
  // Every poll-changing action in the app — creation, a worker's response,
  // HR marking attendance on someone's behalf, an incharge or the scheduler
  // closing a poll — already calls this one function, so logging here (with
  // whatever requestId/job id is active) covers all of them without a
  // separate log line needing to be added at each call site.
  logger.info('poll.update', { pollId, departmentId, workerId, type });

  if (!io) return;
  const payload = { pollId, departmentId, workerId, type, at: new Date().toISOString() };
  if (departmentId) io.to(`dept:${departmentId}`).emit('poll:update', payload);
  io.to('hr').emit('poll:update', payload);
}

// Follow-up record changed — HR-only feature, so only the "hr" room needs it.
function emitFollowUpUpdate({ pollId, workerId }) {
  logger.info('followup.update', { pollId, workerId });

  if (!io) return;
  io.to('hr').emit('followup:update', { pollId, workerId, at: new Date().toISOString() });
}

// A console login changed (invited, accepted, edited, deactivated, deleted,
// approved). Lets every open Settings page refresh its list straight away —
// e.g. "Invitation pending" disappears the moment the person sets a password.
function emitStaffUpdate({ userId, type }) {
  if (!io) return;
  io.to('hr').emit('staff:update', { userId, type, at: new Date().toISOString() });
}

// Workers/incharges added, edited, deactivated or deleted (from the console
// or the incharge app) — keeps every open Workforce page current.
function emitWorkforceUpdate({ type, count = 1 }) {
  if (!io) return;
  io.to('hr').emit('workforce:update', { type, count, at: new Date().toISOString() });
}

// A password reset request was created, refreshed, approved, rejected or
// completed — the plant's incharge apps (Requests tab + badge) and HR refresh.
function emitResetRequestUpdate({ departmentId }) {
  if (!io) return;
  const payload = { at: new Date().toISOString() };
  if (departmentId) io.to(`dept:${departmentId}`).emit('reset:update', payload);
  io.to('hr').emit('reset:update', payload);
}

module.exports = { initRealtime, emitPollUpdate, emitFollowUpUpdate, emitStaffUpdate, emitWorkforceUpdate, emitResetRequestUpdate };
