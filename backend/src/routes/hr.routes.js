const express = require('express');
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
} = require('../validation/schemas');
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
router.post('/departments', sensitiveLimiter, validate({ body: createDepartmentBody }), createDepartment);
router.patch(
  '/departments/:id',
  sensitiveLimiter,
  validate({ params: idParam, body: updateDepartmentBody }),
  updateDepartment
);
router.delete('/departments/:id', sensitiveLimiter, validate({ params: idParam }), deactivateDepartment);
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

router.get('/follow-ups', getFollowUps);
router.patch('/follow-ups', validate({ body: updateFollowUpBody }), updateFollowUp);
router.get('/export/manpower.xlsx', exportManpowerExcel);
router.get('/export/daily-shifts.xlsx', exportDailyShiftsExcel);

module.exports = router;
