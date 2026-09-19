const express = require('express');
const { login, getMe, logout } = require('../controllers/auth.controller');
const { savePushToken, getPushStatus, clearPushToken } = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiters');
const { workerLoginBody, pushTokenBody } = require('../validation/schemas');

const router = express.Router();

router.post('/login', loginLimiter, validate({ body: workerLoginBody }), login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.get('/push-status', authenticate, getPushStatus);
router.post('/push-token', authenticate, validate({ body: pushTokenBody }), savePushToken);
router.delete('/push-token', authenticate, clearPushToken);

module.exports = router;
