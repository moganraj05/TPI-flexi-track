const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { pollIdParam, respondBody } = require('../validation/schemas');
const {
  getTodayPoll,
  respondToPoll,
  getMyResponses,
} = require('../controllers/employee.controller');

const router = express.Router();

router.use(authenticate);
router.use(authorize('worker'));

router.get('/polls/today', getTodayPoll);
router.post(
  '/polls/:pollId/respond',
  validate({ params: pollIdParam, body: respondBody }),
  respondToPoll
);
router.get('/responses/mine', getMyResponses);

module.exports = router;
