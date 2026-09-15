const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getTodayPoll,
  respondToPoll,
  getMyResponses,
} = require('../controllers/employee.controller');

const router = express.Router();

router.use(authenticate);
router.use(authorize('worker'));

router.get('/polls/today', getTodayPoll);
router.post('/polls/:pollId/respond', respondToPoll);
router.get('/responses/mine', getMyResponses);

module.exports = router;
