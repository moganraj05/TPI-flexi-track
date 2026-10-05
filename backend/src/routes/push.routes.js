const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sensitiveLimiter } = require('../middleware/rateLimiters');
const { webPushSubscriptionBody, webPushEndpointBody } = require('../validation/schemas');
const { getPublicKey, saveSubscription, deleteSubscription, getStatus, sendTest } = require('../controllers/web-push.controller');

// Web Push for the worker/incharge web app. The Android APK keeps using its
// own Expo token endpoints under /api/auth (push-token, push-status).
const router = express.Router();

router.get('/public-key', getPublicKey);

router.use(authenticate);
router.use(authorize('worker', 'incharge', 'supervisor'));

router.get('/status', getStatus);
router.post('/subscription', validate({ body: webPushSubscriptionBody }), saveSubscription);
router.delete('/subscription', validate({ body: webPushEndpointBody }), deleteSubscription);
router.post('/test', sensitiveLimiter, sendTest);

module.exports = router;
