const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  login,
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
  getFollowUps,
  updateFollowUp,
  changePassword,
  exportPollExcel,
  exportPollPdf,
  exportManpowerExcel,
} = require('../controllers/hr.controller');

const router = express.Router();

router.post('/login', login);

router.use(authenticate);
router.use(authorize('hr', 'admin', 'superadmin'));

router.get('/me', getMe);
router.patch('/me/password', changePassword);
router.get('/dashboard', getDashboard);
router.get('/polls', getPolls);
router.get('/polls/:pollId', getPollDetail);
router.post('/polls/:pollId/attendance', markAttendance);
router.get('/polls/:pollId/export.xlsx', exportPollExcel);
router.get('/polls/:pollId/export.pdf', exportPollPdf);
router.get('/workforce', getWorkforce);
router.get('/employees/:employeeId', getEmployee);
router.get('/live', getLiveBoard);
router.get('/departments', getDepartments);
router.get('/departments/:id', getDepartment);
router.get('/follow-ups', getFollowUps);
router.patch('/follow-ups', updateFollowUp);
router.get('/export/manpower.xlsx', exportManpowerExcel);

module.exports = router;
