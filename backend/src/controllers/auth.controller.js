const prisma = require('../config/prisma');
const { signToken, revokeSession, renewedToken } = require('../utils/jwt');
const { comparePassword, hashPassword } = require('../utils/password');
const { ownPasswordProblem } = require('../services/temp-password.service');
const { recordAudit, personLabel } = require('../services/audit.service');
const { emitWorkforceUpdate, emitResetRequestUpdate } = require('../realtime');
const { submitResetRequest, cancelOnSignIn, markCompleted } = require('../services/password-reset.service');
const { formatDept } = require('../utils/pollReport');
const logger = require('../utils/logger');

const WORKER_APP_ROLES = ['worker', 'incharge', 'supervisor'];

const formatUser = (user) => ({
  id: user.id,
  employeeId: user.employeeId,
  name: user.name,
  phone: user.phone,
  role: user.role,
  department: formatDept(user.department),
  shiftStart: user.shiftStart || null,
  shiftEnd: user.shiftEnd || null,
  email: user.email || null,
  // The app must ask for a new password before anything else.
  mustChangePassword: user.mustChangePassword === true,
});

exports.login = async (req, res, next) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({ success: false, message: 'Employee ID and password are required' });
    }

    const normalizedId = employeeId.toUpperCase();
    const user = await prisma.user.findUnique({
      where: { employeeId: normalizedId },
      include: { department: true },
    });

    if (!user || !user.isActive) {
      logger.warn('auth.login_failed', { employeeId: normalizedId, reason: 'no_such_active_account' });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      logger.warn('auth.login_failed', { employeeId: normalizedId, userId: user.id, reason: 'wrong_password' });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // This login serves the worker/incharge app only. HR and admin accounts
    // have no screens there; they sign in at the staff console instead.
    // Checked after the password so this answer can't be used to probe which
    // employee IDs belong to HR accounts.
    if (!WORKER_APP_ROLES.includes(user.role)) {
      logger.warn('auth.login_failed', { employeeId: normalizedId, userId: user.id, reason: 'staff_account' });
      return res.status(403).json({
        success: false,
        message: 'This is an HR/admin account. Please sign in at the staff console (/staff/login).',
        data: { staffLogin: '/staff/login' },
      });
    }

    // A temporary password stops working when it expires; checked only after
    // the password matched, so this can't be used to probe accounts.
    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
      logger.warn('auth.login_failed', { employeeId: normalizedId, userId: user.id, reason: 'temporary_password_expired' });
      return res.status(401).json({
        success: false,
        code: 'TEMP_PASSWORD_EXPIRED',
        message: 'This temporary password has expired. Ask your incharge or HR for a new one.',
      });
    }

    const token = signToken(user);
    logger.info('auth.login_succeeded', { userId: user.id, role: user.role });

    // Remember the sign-in; a pending "forgot password" request is no longer
    // needed once they could sign in with their own password.
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    if (!user.mustChangePassword && (await cancelOnSignIn(user.id))) {
      emitResetRequestUpdate({ departmentId: user.departmentId });
    }

    res.json({
      success: true,
      data: { token, user: formatUser(user) },
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  // `token`: a renewed token when the current one is old (the app saves it),
  // so someone who keeps using the app is never signed out by expiry.
  res.json({ success: true, data: formatUser(req.user), token: renewedToken(req.user, req.auth) });
};

exports.logout = async (req, res, next) => {
  try {
    // Logs out this device only: its session is revoked, the person stays
    // signed in on their other phones/browsers. This device's notification
    // subscription goes with it (sent as `endpoint`), so a signed-out phone
    // doesn't keep showing this person's attendance alerts.
    await revokeSession(req.auth, req.user.id);
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.slice(0, 1000) : null;
    if (endpoint) {
      await prisma.webPushSubscription.deleteMany({ where: { userId: req.user.id, endpoint } });
    }
    logger.info('auth.logout', { userId: req.user.id });
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};

// Sets the signed-in person's own password. While a change is required
// (temporary password), the current password isn't asked again — they just
// signed in with it. Otherwise (a voluntary change from Profile) it is.
// Every other session is signed out; this device gets a fresh token.
exports.changeOwnPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const account = await prisma.user.findUnique({ where: { id: req.user.id } });
    const forced = account.mustChangePassword === true;

    if (!forced) {
      if (!currentPassword || !(await comparePassword(String(currentPassword), account.password))) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }

    const problem = await ownPasswordProblem(newPassword, account, account.password);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const updated = await prisma.user.update({
      where: { id: account.id },
      data: {
        password: await hashPassword(newPassword),
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
      include: { department: true },
    });

    await recordAudit(req, {
      action: 'auth.worker_password_changed',
      entityType: 'user',
      entityId: updated.id,
      entityLabel: personLabel(updated),
      summary: forced
        ? `${personLabel(updated)} set their own password (replacing a temporary one)`
        : `${personLabel(updated)} changed their password`,
      changes: [{ field: 'password', label: 'Password', from: null, to: null, note: 'changed' }],
      metadata: { replacedTemporary: forced },
    });
    // Clears "must set password" badges in open HR / incharge screens, and
    // marks an approved reset request as completed.
    emitWorkforceUpdate({ type: 'password_changed' });
    if (forced && (await markCompleted(updated.id)).count) {
      emitResetRequestUpdate({ departmentId: updated.departmentId });
    }

    res.json({
      success: true,
      message: 'Password changed. You are signed out on your other devices.',
      data: { token: signToken(updated), user: formatUser(updated) },
    });
  } catch (error) {
    next(error);
  }
};

// Public: "Forgot password?" on the worker app's sign-in page. Always the
// same answer, whether or not the Employee ID / phone digits matched, so it
// can't be used to find out who has an account.
exports.forgotPassword = async (req, res, next) => {
  try {
    await submitResetRequest(req, { employeeId: req.body.employeeId, phoneLast4: req.body.phoneLast4 });
    res.json({
      success: true,
      message: 'If the details match an account, your request has been sent to your incharge. They will call you with a temporary password.',
    });
  } catch (error) {
    next(error);
  }
};
