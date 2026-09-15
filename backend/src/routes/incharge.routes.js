const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
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
router.post('/team', createTeamWorker);
router.patch('/team/:workerId', updateTeamWorker);
router.delete('/team/:workerId', deleteTeamWorker);
router.get('/polls', getMyPolls);
router.get('/polls/:pollId', getPollDetail);
router.patch('/polls/:pollId/close', closePoll);

module.exports = router;
