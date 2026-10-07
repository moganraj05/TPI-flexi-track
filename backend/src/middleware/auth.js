const prisma = require('../config/prisma');
const { verifyToken, isSessionRevoked } = require('../utils/jwt');
const logger = require('../utils/logger');

const PASSWORD_CHANGE_ALLOWED = new Set(['GET /api/auth/me', 'POST /api/auth/change-password', 'POST /api/auth/logout']);

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      logger.warn('auth.failed', { reason: 'missing_token', path: req.originalUrl });
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = header.split(' ')[1];
    const decoded = verifyToken(token);

    // Explicit select rather than `include`: this runs on every authenticated
    // request, and the password hash was being read out of the database each
    // time despite nothing on req.user ever needing it (changePassword
    // re-fetches the row itself).
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        departmentId: true,
        inchargeId: true,
        shiftStart: true,
        shiftEnd: true,
        shiftName: true,
        equipment: true,
        process: true,
        isActive: true,
        tokenVersion: true,
        mustChangePassword: true,
        tempPasswordExpiresAt: true,
        department: { select: { id: true, name: true, code: true, isActive: true } },
      },
    });

    if (!user || !user.isActive) {
      logger.warn('auth.failed', { reason: 'inactive_or_missing_account', userId: decoded.id, path: req.originalUrl });
      return res.status(401).json({ success: false, message: 'Invalid or inactive account' });
    }

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      logger.warn('auth.failed', { reason: 'token_revoked', userId: user.id, path: req.originalUrl });
      return res.status(401).json({ success: false, message: 'Session expired, please log in again' });
    }

    // This device logged out (other devices of the same person stay signed in).
    if (await isSessionRevoked(decoded)) {
      logger.warn('auth.failed', { reason: 'session_logged_out', userId: user.id, path: req.originalUrl });
      return res.status(401).json({ success: false, message: 'Session expired, please log in again' });
    }

    // A temporary password (new account, reset) or an admin-required change:
    // nothing but reading your profile, changing the password and signing
    // out works until a new password is set — enforced here, not just by the
    // app's screens, so it can't be skipped.
    if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${req.baseUrl}${req.path}`)) {
      return res.status(403).json({
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Set a new password to continue.',
      });
    }

    req.user = user;
    // The decoded token (session id, issue time) — logout ends this session,
    // GET /me renews an old token.
    req.auth = decoded;
    // Every subsequent log line for this request — controller, service, the
    // error handler if it fails — now carries who made it, without any of
    // them needing req.user threaded in explicitly.
    logger.extendContext({ userId: user.id, role: user.role });
    next();
  } catch {
    logger.warn('auth.failed', { reason: 'invalid_or_expired_token', path: req.originalUrl });
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

module.exports = { authenticate, authorize };
