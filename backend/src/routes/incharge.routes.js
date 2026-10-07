const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sensitiveLimiter } = require('../middleware/rateLimiters');
const { listResetRequests, approveResetRequest, rejectResetRequest } = require('../controllers/reset-requests.controller');
const {
  pollIdParam,
  workerIdParam,
  createTeamWorkerBody,
  updateTeamWorkerBody,
  resetRequestIdParam,
  rejectResetRequestBody,
} = require('../validation/schemas');
const {
  getMyPolls,
  getPollDetail,
  closePoll,
  getTeamWorkers,
  createTeamWorker,
  updateTeamWorker,
  deleteTeamWorker,
} = require('../controllers/incharge.controller');

const router = express.Router();

router.use(authenticate);
router.use(authorize('incharge', 'supervisor'));

router.get('/team', getTeamWorkers);
router.post('/team', sensitiveLimiter, validate({ body: createTeamWorkerBody }), createTeamWorker);
router.patch(
  '/team/:workerId',
  sensitiveLimiter,
  validate({ params: workerIdParam, body: updateTeamWorkerBody }),
  updateTeamWorker
);
router.delete('/team/:workerId', sensitiveLimiter, validate({ params: workerIdParam }), deleteTeamWorker);
// Password reset requests from the people this incharge / supervisor looks after.
router.get('/reset-requests', listResetRequests);
router.post('/reset-requests/:requestId/approve', sensitiveLimiter, validate({ params: resetRequestIdParam }), approveResetRequest);
router.post(
  '/reset-requests/:requestId/reject',
  sensitiveLimiter,
  validate({ params: resetRequestIdParam, body: rejectResetRequestBody }),
  rejectResetRequest
);
router.get('/polls', getMyPolls);
router.get('/polls/:pollId', validate({ params: pollIdParam }), getPollDetail);
router.patch('/polls/:pollId/close', validate({ params: pollIdParam }), closePoll);

module.exports = router;
