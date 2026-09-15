const express = require('express');
const { login, getMe } = require('../controllers/auth.controller');
const { savePushToken, getPushStatus, clearPushToken } = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', authenticate, getMe);
router.get('/push-status', authenticate, getPushStatus);
router.post('/push-token', authenticate, savePushToken);
router.delete('/push-token', authenticate, clearPushToken);

module.exports = router;
