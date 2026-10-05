const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { getVapidPublicKey } = require('../config/webPush');
const { sendWebPushNotifications } = require('../services/notification.service');

// Public: the browser needs the VAPID public key to create a subscription.
// `enabled: false` tells the web app to hide its notification controls
// instead of offering a switch that can never work.
exports.getPublicKey = (req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ success: true, data: { enabled: !!publicKey, publicKey } });
};

// Saves (or re-saves) this browser's subscription for the signed-in user.
// Upsert by endpoint: the same browser re-subscribing after a different
// person signs in on it moves the row to the new user, so a shared phone
// never keeps alerting the previous worker's account.
exports.saveSubscription = async (req, res, next) => {
  try {
    if (!getVapidPublicKey()) {
      return res.status(503).json({ success: false, message: 'Notifications are not set up on this server yet.' });
    }

    const { endpoint, keys } = req.body;
    const userAgent = String(req.get('user-agent') || '').slice(0, 300) || null;

    await prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.user.id, userAgent },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user.id, userAgent },
    });

    const count = await prisma.webPushSubscription.count({ where: { userId: req.user.id } });
    logger.info('push.web_subscribed', { userId: req.user.id, subscriptions: count });

    res.json({ success: true, message: 'Notifications enabled on this device', data: { registered: true, subscriptions: count } });
  } catch (error) {
    next(error);
  }
};

// Removes this browser's subscription (the user turned notifications off, or
// is signing out). Scoped to the caller's own rows.
exports.deleteSubscription = async (req, res, next) => {
  try {
    const { count } = await prisma.webPushSubscription.deleteMany({
      where: { endpoint: req.body.endpoint, userId: req.user.id },
    });
    if (count > 0) logger.info('push.web_unsubscribed', { userId: req.user.id });
    res.json({ success: true, message: 'Notifications turned off on this device' });
  } catch (error) {
    next(error);
  }
};

// How this user can currently be reached: browsers subscribed, plus whether
// the Android APK (Expo) has a token. Lets the web app say "on for 2 devices".
exports.getStatus = async (req, res, next) => {
  try {
    const [subscriptions, user] = await Promise.all([
      prisma.webPushSubscription.count({ where: { userId: req.user.id } }),
      prisma.user.findUnique({ where: { id: req.user.id }, select: { pushToken: true } }),
    ]);
    res.json({
      success: true,
      data: {
        enabled: !!getVapidPublicKey(),
        subscriptions,
        appInstalled: !!user?.pushToken?.startsWith('ExponentPushToken['),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Sends a test notification to the caller's own subscribed browsers, so a
// person (or whoever is setting up a phone) can confirm notifications really
// arrive — the only way to check the whole chain: permission, service
// worker, push service, and this server's keys.
exports.sendTest = async (req, res, next) => {
  try {
    if (!getVapidPublicKey()) {
      return res.status(503).json({ success: false, message: 'Notifications are not set up on this server yet.' });
    }

    const subscriptions = await prisma.webPushSubscription.findMany({
      where: { userId: req.user.id },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) {
      return res.status(400).json({ success: false, message: 'Turn on notifications on this device first.' });
    }

    const result = await sendWebPushNotifications(subscriptions, {
      title: 'FlexiTrack test',
      body: 'Notifications are working on this device.',
      data: { type: 'test' },
      url: '/',
      tag: 'flexitrack-test',
      ttlSeconds: 5 * 60,
    });

    logger.info('push.web_test_sent', { userId: req.user.id, sent: result.sent, failed: result.failed });
    if (result.sent === 0) {
      return res.status(502).json({ success: false, message: 'The notification could not be delivered. Try turning notifications off and on again.' });
    }
    res.json({ success: true, message: 'Test notification sent', data: { sent: result.sent } });
  } catch (error) {
    next(error);
  }
};
