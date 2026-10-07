const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { hashPassword } = require('../utils/password');
const {
  OtpError,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  issueOtp,
  discardOtp,
  verifyOtp,
  readTicket,
  consumeOtpInTx,
} = require('../services/otp.service');
const email = require('../services/email.service');
const { recordAudit, personLabel, roleName } = require('../services/audit.service');
const { InviteError, readInviteToken } = require('../services/staff-invite.service');
const { emitStaffUpdate } = require('../realtime');

const HR_ROLES = ['hr', 'admin', 'superadmin'];
const APPROVER_ROLES = ['admin', 'superadmin'];

// Comma-separated list; defaults to the company domain. Compared against the
// exact part after the last "@", so look-alikes such as
// "x@tii.murugappa.com.evil.com" or "x@eviltii.murugappa.com" never match.
const allowedDomains = () =>
  (process.env.HR_ALLOWED_EMAIL_DOMAINS || 'tii.murugappa.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

const isAllowedEmail = (address) => allowedDomains().includes(address.slice(address.lastIndexOf('@') + 1));

const domainMessage = () => `Only ${allowedDomains().map((d) => `@${d}`).join(' / ')} email addresses can register.`;

const FORGOT_GENERIC_MESSAGE =
  'If this email belongs to an active FlexiTrack HR account, a verification code has been sent to it.';

const sendOtpResponse = (res, message) =>
  res.json({
    success: true,
    message,
    data: { expiresInMinutes: OTP_TTL_MINUTES, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS },
  });

// OtpError carries its own status/message; everything else goes to the
// shared error handler.
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error instanceof OtpError) {
      return res.status(error.status).json({ success: false, message: error.message, data: error.extra });
    }
    next(error);
  }
};

// In production a missing email-service configuration fails every send the same way,
// before any account lookup — so it can't reveal which emails exist.
const requireEmailService = (res) => {
  if (process.env.NODE_ENV === 'production' && !email.isConfigured()) {
    logger.error('email.not_configured');
    res.status(503).json({ success: false, message: 'Email service is not available. Please contact the administrator.' });
    return false;
  }
  return true;
};

// Best-effort notifications: the main action already succeeded, so a mail
// failure is logged, never surfaced as an error to the user.
const notify = (event, promise) =>
  promise.catch((error) => logger.error('email.notify_failed', { event, error: error.message }));

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

// Active plants for the registration dropdown — public because the person
// registering isn't signed in yet. Names and codes only.
exports.getRegistrationPlants = handle(async (req, res) => {
  const plants = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: plants });
});

// Step 1: validate the details and email a code. The details travel with
// the OTP row and are re-checked at the final step.
exports.sendRegisterOtp = handle(async (req, res) => {
  if (!requireEmailService(res)) return;

  const { name, department, phone } = req.body;
  const address = req.body.email;
  const employeeId = req.body.employeeId.toUpperCase();

  if (!isAllowedEmail(address)) {
    return res.status(400).json({ success: false, message: domainMessage() });
  }

  const plant = await prisma.department.findFirst({ where: { id: department, isActive: true }, select: { id: true } });
  if (!plant) {
    return res.status(400).json({ success: false, message: 'Select a valid plant' });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: address }, { employeeId }] },
    select: { email: true, approvalStatus: true },
  });
  if (existing) {
    if (existing.email === address) {
      const message =
        existing.approvalStatus === 'pending'
          ? 'This email is already registered and waiting for admin approval.'
          : 'An account with this email already exists. Use Sign in or Forgot password.';
      return res.status(409).json({ success: false, message });
    }
    return res.status(409).json({ success: false, message: 'This Employee ID is already registered.' });
  }

  const { code, otpId } = await issueOtp({
    email: address,
    purpose: 'register',
    payload: { name, employeeId, departmentId: plant.id, phone },
    requestIp: req.ip,
  });

  try {
    await email.sendOtpEmail({ to: address, code, purpose: 'register', expiresInMinutes: OTP_TTL_MINUTES });
  } catch (error) {
    await discardOtp(otpId);
    logger.error('email.otp_send_failed', { purpose: 'register', error: error.message });
    return res.status(502).json({ success: false, message: 'Could not send the verification email. Please try again.' });
  }

  logger.info('hr_register.otp_sent', { email: address });
  sendOtpResponse(res, `A 6-digit code has been sent to ${address}.`);
});

// Step 2: check the code; returns a short-lived ticket for step 3.
exports.verifyRegisterOtp = handle(async (req, res) => {
  const result = await verifyOtp({ email: req.body.email, purpose: 'register', code: req.body.otp });
  res.json({ success: true, message: 'Email verified', data: result });
});

// Step 3: set the password and create the account as pending approval.
exports.completeRegistration = handle(async (req, res) => {
  const otp = await readTicket(req.body.ticket, 'register');
  const details = otp.payload || {};
  const passwordHash = await hashPassword(req.body.password);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      await consumeOtpInTx(tx, otp.id);

      // Re-checked here: the email/Employee ID/plant may have changed in
      // the minutes since step 1.
      const taken = await tx.user.findFirst({
        where: { OR: [{ email: otp.email }, { employeeId: details.employeeId }] },
        select: { id: true },
      });
      if (taken) throw new OtpError(409, 'This email or Employee ID has just been registered. Please sign in or contact your administrator.');

      const plant = await tx.department.findFirst({ where: { id: details.departmentId, isActive: true }, select: { id: true } });

      return tx.user.create({
        data: {
          employeeId: details.employeeId,
          name: details.name,
          email: otp.email,
          phone: details.phone || '',
          password: passwordHash,
          role: 'hr',
          departmentId: plant?.id || null,
          isActive: false,
          approvalStatus: 'pending',
          emailVerifiedAt: otp.verifiedAt,
        },
        include: { department: { select: { name: true, code: true } } },
      });
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new OtpError(409, 'This email or Employee ID has just been registered. Please sign in or contact your administrator.');
    }
    throw error;
  }

  logger.info('hr_register.submitted', { userId: user.id, email: user.email });
  await recordAudit(req, {
    action: 'account.registration_submitted',
    entityType: 'user',
    entityId: user.id,
    entityLabel: personLabel(user),
    summary: `${personLabel(user)} registered for an HR login (waiting for approval)`,
    metadata: { plant: user.department ? `${user.department.name} (${user.department.code})` : null },
    actor: { id: user.id, name: user.name, role: 'hr', identifier: user.email },
  });

  notify('registration_received', email.sendRegistrationReceivedEmail({ to: user.email, name: user.name }));

  const approvers = await prisma.user.findMany({
    where: { role: { in: APPROVER_ROLES }, isActive: true, approvalStatus: 'approved', email: { not: null } },
    select: { email: true },
  });
  const applicant = {
    name: user.name,
    employeeId: user.employeeId,
    email: user.email,
    phone: user.phone,
    plant: user.department ? `${user.department.name} (${user.department.code})` : '',
  };
  approvers.forEach((a) => notify('registration_admin_alert', email.sendNewRegistrationAdminEmail({ to: a.email, applicant })));

  emitStaffUpdate({ userId: user.id, type: 'registered' });
  res.status(201).json({
    success: true,
    message: 'Registration submitted. An administrator must approve your account before you can sign in.',
  });
});

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

// Always answers with the same message whether or not the email has an
// account, so this endpoint can't be used to discover HR emails. A code is
// only actually sent to active, approved HR accounts.
exports.sendResetOtp = handle(async (req, res) => {
  if (!requireEmailService(res)) return;

  const address = req.body.email;
  const user = await prisma.user.findUnique({
    where: { email: address },
    select: { role: true, isActive: true, approvalStatus: true },
  });
  const eligible = user && HR_ROLES.includes(user.role) && user.isActive && user.approvalStatus === 'approved';

  if (eligible) {
    try {
      const { code, otpId } = await issueOtp({ email: address, purpose: 'reset_password', requestIp: req.ip });
      try {
        await email.sendOtpEmail({ to: address, code, purpose: 'reset_password', expiresInMinutes: OTP_TTL_MINUTES });
        logger.info('hr_reset.otp_sent', { email: address });
      } catch (error) {
        await discardOtp(otpId);
        logger.error('email.otp_send_failed', { purpose: 'reset_password', error: error.message });
      }
    } catch (error) {
      // Cooldown/hourly cap: swallowed to keep the response identical for
      // every email. The page's own resend timer covers the normal case.
      if (!(error instanceof OtpError)) throw error;
      logger.warn('hr_reset.otp_throttled', { email: address, reason: error.message });
    }
  }

  sendOtpResponse(res, FORGOT_GENERIC_MESSAGE);
});

exports.verifyResetOtp = handle(async (req, res) => {
  const result = await verifyOtp({ email: req.body.email, purpose: 'reset_password', code: req.body.otp });
  res.json({ success: true, message: 'Code verified', data: result });
});

// Sets the new password and signs the account out everywhere (tokenVersion
// bump), in the same transaction that burns the ticket.
exports.resetPassword = handle(async (req, res) => {
  const otp = await readTicket(req.body.ticket, 'reset_password');
  const passwordHash = await hashPassword(req.body.password);

  const user = await prisma.$transaction(async (tx) => {
    await consumeOtpInTx(tx, otp.id);

    const account = await tx.user.findUnique({ where: { email: otp.email } });
    if (!account || !HR_ROLES.includes(account.role) || !account.isActive || account.approvalStatus !== 'approved') {
      throw new OtpError(400, 'This account can no longer be reset. Please contact your administrator.');
    }

    return tx.user.update({
      where: { id: account.id },
      data: { password: passwordHash, tokenVersion: { increment: 1 }, mustSetPassword: false },
      select: { id: true, name: true, email: true },
    });
  });

  logger.info('hr_reset.password_changed', { userId: user.id });
  await recordAudit(req, {
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: user.id,
    entityLabel: personLabel(user),
    summary: `${user.name} reset their password with an email code (signed out everywhere)`,
    changes: [{ field: 'password', label: 'Password', from: null, to: null, note: 'changed' }],
    actor: { id: user.id, name: user.name, identifier: user.email },
  });
  notify('password_changed', email.sendPasswordChangedEmail({ to: user.email, name: user.name }));

  emitStaffUpdate({ userId: user.id, type: 'password_reset' });
  res.json({ success: true, message: 'Password updated. Please sign in with your new password.' });
});

// ---------------------------------------------------------------------------
// Admin approval (admin / superadmin only — enforced in the router)
// ---------------------------------------------------------------------------

// The `approvalStatus: 'pending'` condition on the write makes approve and
// reject race-safe: if two admins act on the same registration at once, only
// the first write matches and the second gets a clear "already processed".
exports.approveHrRegistration = handle(async (req, res) => {
  const role = req.body?.role || 'hr';

  const { count } = await prisma.user.updateMany({
    where: { id: req.params.id, role: { in: HR_ROLES }, approvalStatus: 'pending' },
    data: {
      approvalStatus: 'approved',
      isActive: true,
      role,
      approvedAt: new Date(),
      approvedById: req.user.id,
    },
  });
  if (count !== 1) {
    return res.status(409).json({ success: false, message: 'This registration was already approved or rejected.' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, email: true, employeeId: true } });
  logger.info('hr_register.approved', { userId: user.id, role, approvedBy: req.user.id });
  await recordAudit(req, {
    action: 'account.registration_approved',
    entityType: 'user',
    entityId: user.id,
    entityLabel: personLabel(user),
    summary: `Approved the HR registration of ${personLabel(user)} as ${roleName(role)}`,
    changes: [
      { field: 'approvalStatus', label: 'Approval', from: 'Pending', to: 'Approved' },
      { field: 'role', label: 'Role', from: null, to: roleName(role) },
    ],
    metadata: { role },
  });
  notify('registration_approved', email.sendApprovalEmail({ to: user.email, name: user.name }));

  emitStaffUpdate({ userId: user.id, type: 'approved' });
  res.json({ success: true, message: `${user.name} approved` });
});

// Rejecting deletes the pending row outright: it never signed in, so it has
// no polls, responses or follow-ups attached, and deleting it frees the
// email and Employee ID should the person need to register again.
exports.rejectHrRegistration = handle(async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, role: { in: HR_ROLES }, approvalStatus: 'pending' },
    select: { id: true, name: true, email: true, employeeId: true },
  });
  if (!user) {
    return res.status(409).json({ success: false, message: 'This registration was already approved or rejected.' });
  }

  const { count } = await prisma.user.deleteMany({ where: { id: user.id, approvalStatus: 'pending' } });
  if (count !== 1) {
    return res.status(409).json({ success: false, message: 'This registration was already approved or rejected.' });
  }

  logger.info('hr_register.rejected', { userId: user.id, rejectedBy: req.user.id });
  await recordAudit(req, {
    action: 'account.registration_rejected',
    entityType: 'user',
    entityId: user.id,
    entityLabel: personLabel(user),
    summary: `Rejected the HR registration of ${personLabel(user)} (the pending account was removed)`,
  });
  notify('registration_rejected', email.sendRejectionEmail({ to: user.email, name: user.name }));

  emitStaffUpdate({ userId: user.id, type: 'rejected' });
  res.json({ success: true, message: `${user.name}'s registration rejected` });
});

// ---------------------------------------------------------------------------
// Staff invitations (an admin created the login; the person sets a password)
// ---------------------------------------------------------------------------

const inviteHandle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error instanceof InviteError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// Checks an invitation link before showing the set-password form, so a
// used/expired/replaced link says so straight away.
exports.verifyStaffInvite = inviteHandle(async (req, res) => {
  const user = await readInviteToken(req.body.token);
  res.json({ success: true, data: { name: user.name, email: user.email, role: roleName(user.role) } });
});

// Sets the invited person's own password. Bumping tokenVersion makes the link
// single-use (and signs out any session, though there can't be one yet).
exports.acceptStaffInvite = inviteHandle(async (req, res) => {
  const user = await readInviteToken(req.body.ticket);
  const passwordHash = await hashPassword(req.body.password);

  const { count } = await prisma.user.updateMany({
    where: { id: user.id, mustSetPassword: true, tokenVersion: user.tokenVersion },
    data: {
      password: passwordHash,
      mustSetPassword: false,
      emailVerifiedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  });
  if (count !== 1) {
    return res.status(409).json({ success: false, message: 'This invitation has already been used. Sign in, or use “Forgot password?”.' });
  }

  logger.info('staff_invite.accepted', { userId: user.id });
  await recordAudit(req, {
    action: 'account.invite_accepted',
    entityType: 'user',
    entityId: user.id,
    entityLabel: personLabel(user),
    summary: `${personLabel(user)} accepted their invitation and set a password`,
    changes: [{ field: 'password', label: 'Password', from: null, to: null, note: 'changed' }],
    actor: { id: user.id, name: user.name, role: user.role, identifier: user.email },
  });

  emitStaffUpdate({ userId: user.id, type: 'invite_accepted' });
  res.json({ success: true, message: 'Password set. You can now sign in with your email and new password.' });
});
