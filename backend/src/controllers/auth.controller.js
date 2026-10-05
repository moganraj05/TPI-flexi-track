const prisma = require('../config/prisma');
const { signToken } = require('../utils/jwt');
const { comparePassword } = require('../utils/password');
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

    const token = signToken(user);
    logger.info('auth.login_succeeded', { userId: user.id, role: user.role });

    res.json({
      success: true,
      data: { token, user: formatUser(user) },
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, data: formatUser(req.user) });
};

exports.logout = async (req, res, next) => {
  try {
    // Logout revokes every session of this user (tokenVersion), so every
    // browser subscription goes with it — a signed-out phone must not keep
    // showing this person's attendance alerts to whoever picks it up next.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user.id },
        data: { tokenVersion: { increment: 1 } },
      }),
      prisma.webPushSubscription.deleteMany({ where: { userId: req.user.id } }),
    ]);
    logger.info('auth.logout', { userId: req.user.id });
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};
