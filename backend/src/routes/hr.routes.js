const express = require('express');
const { getAuditMeta, getAuditLogs, exportAuditLogs } = require('../controllers/audit.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginLimiter, sensitiveLimiter, otpSendLimiter, otpVerifyLimiter } = require('../middleware/rateLimiters');
const { excelUpload } = require('../middleware/upload');
const {
  hrLoginBody,
  changePasswordBody,
  pollIdParam,
  markAttendanceBody,
  employeeIdParam,
  idParam,
  createDepartmentBody,
  updateDepartmentBody,
  createTeamMemberBody,
  updateTeamMemberBody,
  createHrAdminBody,
  updateHrAdminBody,
  updateFollowUpBody,
  registerSendOtpBody,
  otpVerifyBody,
  passwordWithTicketBody,
  forgotPasswordBody,
  approveHrAdminBody,
  sendNotificationBody,
  inviteTokenBody,
  acceptInviteBody,
  bulkTeamBody,
  requirePasswordChangeBody,
  resetRequestIdParam,
  rejectResetRequestBody,
} = require('../validation/schemas');
const {
  listAllResetRequests,
  resetRequestSummary,
  approveResetRequest,
  rejectResetRequest,
} = require('../controllers/reset-requests.controller');
const {
  getRegistrationPlants,
  sendRegisterOtp,
  verifyRegisterOtp,
  completeRegistration,
  sendResetOtp,
  verifyResetOtp,
  resetPassword,
  approveHrRegistration,
  rejectHrRegistration,
  verifyStaffInvite,
  acceptStaffInvite,
} = require('../controllers/hr-account.controller');
const {
  login,
  logout,
  getMe,
  getDashboard,
  getPolls,
  getPollDetail,
  markAttendance,
  getWorkforce,
  getEmployee,
  getLiveBoard,
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  createTeamMember,
  updateTeamMember,
  deactivateTeamMember,
  getHrAdmins,
  createHrAdmin,
  updateHrAdmin,
  deactivateHrAdmin,
  getFollowUps,
  updateFollowUp,
  changePassword,
  exportPollExcel,
  exportPollPdf,
  exportManpowerExcel,
  exportDailyShiftsExcel,
  exportTeamBulkTemplate,
  importTeamBulk,
  sendWorkerNotification,
  resendStaffInvite,
  bulkTeamAction,
  deleteHrAdmin,
  resetTeamMemberPassword,
  requirePasswordChange,
} = require('../controllers/hr.controller');

const router = express.Router();

router.post('/login', loginLimiter, validate({ body: hrLoginBody }), login);

// Public HR self-registration (email OTP -> set password -> admin approval)
// and forgot-password (email OTP -> new password). Unauthenticated by
// nature, so they sit above router.use(authenticate).
router.get('/register/plants', getRegistrationPlants);
router.post('/register/send-otp', otpSendLimiter, validate({ body: registerSendOtpBody }), sendRegisterOtp);
router.post('/register/verify-otp', otpVerifyLimiter, validate({ body: otpVerifyBody }), verifyRegisterOtp);
router.post('/register/complete', otpVerifyLimiter, validate({ body: passwordWithTicketBody }), completeRegistration);
router.post('/password/forgot', otpSendLimiter, validate({ body: forgotPasswordBody }), sendResetOtp);
router.post('/password/verify-otp', otpVerifyLimiter, validate({ body: otpVerifyBody }), verifyResetOtp);
router.post('/password/reset', otpVerifyLimiter, validate({ body: passwordWithTicketBody }), resetPassword);
// Invitation link from an admin-created login: check it, then set a password.
router.post('/invite/verify', otpVerifyLimiter, validate({ body: inviteTokenBody }), verifyStaffInvite);
router.post('/invite/accept', otpVerifyLimiter, validate({ body: acceptInviteBody }), acceptStaffInvite);

router.use(authenticate);
router.use(authorize('hr', 'admin', 'superadmin'));

router.get('/me', getMe);
router.post('/logout', logout);
router.patch('/me/password', sensitiveLimiter, validate({ body: changePasswordBody }), changePassword);
router.get('/dashboard', getDashboard);
router.get('/polls', getPolls);
router.get('/polls/:pollId', validate({ params: pollIdParam }), getPollDetail);
router.post(
  '/polls/:pollId/attendance',
  validate({ params: pollIdParam, body: markAttendanceBody }),
  markAttendance
);
router.get('/polls/:pollId/export.xlsx', validate({ params: pollIdParam }), exportPollExcel);
router.get('/polls/:pollId/export.pdf', validate({ params: pollIdParam }), exportPollPdf);
router.get('/workforce', getWorkforce);
router.get('/employees/:employeeId', validate({ params: employeeIdParam }), getEmployee);
router.get('/live', getLiveBoard);
router.get('/departments', getDepartments);
router.get('/departments/:id', validate({ params: idParam }), getDepartment);
// Plants are configuration: admins only (Staff can still view them).
router.post('/departments', authorize('admin', 'superadmin'), sensitiveLimiter, validate({ body: createDepartmentBody }), createDepartment);
router.patch(
  '/departments/:id',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam, body: updateDepartmentBody }),
  updateDepartment
);
router.delete('/departments/:id', authorize('admin', 'superadmin'), sensitiveLimiter, validate({ params: idParam }), deactivateDepartment);
router.post('/team', sensitiveLimiter, validate({ body: createTeamMemberBody }), createTeamMember);
router.get('/team/bulk-template.xlsx', exportTeamBulkTemplate);
router.post('/team/bulk-import', sensitiveLimiter, excelUpload.single('file'), importTeamBulk);
router.patch(
  '/team/:id',
  sensitiveLimiter,
  validate({ params: idParam, body: updateTeamMemberBody }),
  updateTeamMember
);
router.delete('/team/:id', sensitiveLimiter, validate({ params: idParam }), deactivateTeamMember);
// Admin: deactivate / reactivate / permanently delete many people at once
// (also used for a single permanent delete).
router.post('/team/bulk', authorize('admin', 'superadmin'), sensitiveLimiter, validate({ body: bulkTeamBody }), bulkTeamAction);
// Staff + admin: a new temporary password for someone who forgot theirs.
router.post('/team/:id/reset-password', sensitiveLimiter, validate({ params: idParam }), resetTeamMemberPassword);
// Admin: a whole plant / everyone must set a new password at next sign-in.
router.post(
  '/team/require-password-change',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ body: requirePasswordChangeBody }),
  requirePasswordChange
);

// HR/admin login management is a step above the general HR role — only
// admin/superadmin can view, create, or deactivate these accounts.
router.get('/admins', authorize('admin', 'superadmin'), getHrAdmins);
router.post(
  '/admins',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ body: createHrAdminBody }),
  createHrAdmin
);
router.patch(
  '/admins/:id',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam, body: updateHrAdminBody }),
  updateHrAdmin
);
router.post(
  '/admins/:id/approve',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam, body: approveHrAdminBody }),
  approveHrRegistration
);
router.post(
  '/admins/:id/resend-invite',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam }),
  resendStaffInvite
);
router.post(
  '/admins/:id/reject',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam }),
  rejectHrRegistration
);
router.delete(
  '/admins/:id',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam }),
  deactivateHrAdmin
);
router.delete(
  '/admins/:id/permanent',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ params: idParam }),
  deleteHrAdmin
);

// Worker-app password reset requests from every plant (Staff and Admin).
router.get('/reset-requests/summary', resetRequestSummary);
router.get('/reset-requests', listAllResetRequests);
router.post('/reset-requests/:requestId/approve', sensitiveLimiter, validate({ params: resetRequestIdParam }), approveResetRequest);
router.post(
  '/reset-requests/:requestId/reject',
  sensitiveLimiter,
  validate({ params: resetRequestIdParam, body: rejectResetRequestBody }),
  rejectResetRequest
);

// Audit trail — read-only, admin/superadmin only (there is deliberately no
// route that edits or deletes entries).
router.get('/audit-logs/meta', authorize('admin', 'superadmin'), getAuditMeta);
router.get('/audit-logs/export.csv', authorize('admin', 'superadmin'), exportAuditLogs);
router.get('/audit-logs', authorize('admin', 'superadmin'), getAuditLogs);

router.get('/follow-ups', getFollowUps);
router.patch('/follow-ups', validate({ body: updateFollowUpBody }), updateFollowUp);
// Sending notifications to workers is for admins only.
router.post(
  '/notifications/send',
  authorize('admin', 'superadmin'),
  sensitiveLimiter,
  validate({ body: sendNotificationBody }),
  sendWorkerNotification
);
router.get('/export/manpower.xlsx', exportManpowerExcel);
router.get('/export/daily-shifts.xlsx', exportDailyShiftsExcel);

module.exports = router;
