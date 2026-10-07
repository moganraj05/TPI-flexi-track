const express = require('express');
const { login, getMe, logout, changeOwnPassword, forgotPassword } = require('../controllers/auth.controller');
const { savePushToken, getPushStatus, clearPushToken } = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginLimiter, sensitiveLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiters');
const { workerLoginBody, pushTokenBody, changeOwnPasswordBody, forgotWorkerPasswordBody } = require('../validation/schemas');

const router = express.Router();

router.post('/login', loginLimiter, validate({ body: workerLoginBody }), login);
// Public: ask your incharge to reset your password.
router.post('/forgot-password', forgotPasswordLimiter, validate({ body: forgotWorkerPasswordBody }), forgotPassword);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, sensitiveLimiter, validate({ body: changeOwnPasswordBody }), changeOwnPassword);
router.get('/push-status', authenticate, getPushStatus);
router.post('/push-token', authenticate, validate({ body: pushTokenBody }), savePushToken);
router.delete('/push-token', authenticate, clearPushToken);

module.exports = router;
