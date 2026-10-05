const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { webpush, isWebPushConfigured } = require('../config/webPush');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Neither push service gets to stall a scheduler tick: poll creation and
// reminders await these sends, and the tick guard skips every following tick
// while one is still running.
const EXPO_TIMEOUT_MS = 15 * 1000;
const WEB_PUSH_TIMEOUT_MS = 10 * 1000;
const WEB_PUSH_CONCURRENCY = 25;
// How long a push service keeps trying to deliver to an offline device. An
// attendance alert is useless once its poll has closed, so it isn't kept for
// days the way the push services' defaults would.
const DEFAULT_TTL_SECONDS = 60 * 60;

const isExpoToken = (token) => typeof token === 'string' && token.startsWith('ExponentPushToken[');

const parseTickets = (result) => {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data) return [result.data];
  if (Array.isArray(result?.errors)) return result.errors;
  return [];
};

// Expo push (the installed Android APK). Never throws: a network failure or
// an Expo outage is counted and logged per chunk, so a caller's own work
// (e.g. creating the poll the notification is about) is never undone by it.
const sendPushNotifications = async (tokens, { title, body, data = {} }) => {
  const validTokens = tokens.filter(isExpoToken);
  if (validTokens.length === 0) return { sent: 0, failed: 0, errors: [] };

  const messages = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'default',
  }));

  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const chunk of chunks) {
    let result;
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
      });
      result = await response.json();
    } catch (error) {
      failed += chunk.length;
      errors.push(error.message);
      logger.error('push.api_error', { channel: 'expo', error: error.message, chunkSize: chunk.length });
      continue;
    }

    const tickets = parseTickets(result);

    if (tickets.length === 0) {
      failed += chunk.length;
      const message = result?.errors?.[0]?.message || 'Expo push API returned no tickets';
      errors.push(message);
      // Never the token itself — chunkSize is enough to see the blast radius.
      logger.error('push.api_error', { channel: 'expo', error: message, chunkSize: chunk.length });
      continue;
    }

    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      const token = chunk[i]?.to;

      if (ticket?.status === 'ok') {
        sent += 1;
        continue;
      }

      failed += 1;
      const message = ticket?.message || ticket?.code || 'Unknown push error';
      const errorCode = ticket?.details?.error || ticket?.code;
      errors.push(message);
      // Logged by error code, not the token — a token is per-device-install,
      // not meaningfully actionable in a log even redacted.
      logger.warn('push.delivery_failed', { channel: 'expo', errorCode, error: message });

      if (errorCode === 'DeviceNotRegistered' && token) {
        await prisma.user.updateMany({ where: { pushToken: token }, data: { pushToken: null } });
      }
    }
  }

  return { sent, failed, errors };
};

// Web Push (browsers and the installed web app). Same never-throws contract
// as the Expo sender. A 404/410 from the push service means the browser
// dropped the subscription (permission revoked, site data cleared, app
// uninstalled), so that row is deleted — the web equivalent of Expo's
// DeviceNotRegistered cleanup above.
const sendWebPushNotifications = async (subscriptions, { title, body, data = {}, url, tag, ttlSeconds }) => {
  if (subscriptions.length === 0 || !isWebPushConfigured()) return { sent: 0, failed: 0, errors: [] };

  const payload = JSON.stringify({ title, body, data, url: url || '/', tag: tag || data.type || 'flexitrack' });
  const options = {
    TTL: ttlSeconds ?? DEFAULT_TTL_SECONDS,
    urgency: 'high',
    timeout: WEB_PUSH_TIMEOUT_MS,
  };

  let sent = 0;
  let failed = 0;
  const errors = [];
  const delivered = [];
  const gone = [];

  for (let i = 0; i < subscriptions.length; i += WEB_PUSH_CONCURRENCY) {
    const batch = subscriptions.slice(i, i + WEB_PUSH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((sub) =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options)
      )
    );

    results.forEach((result, index) => {
      const sub = batch[index];
      if (result.status === 'fulfilled') {
        sent += 1;
        delivered.push(sub.id);
        return;
      }

      failed += 1;
      const statusCode = result.reason?.statusCode;
      const message = result.reason?.body || result.reason?.message || 'Unknown web push error';
      errors.push(message);
      if (statusCode === 404 || statusCode === 410) {
        gone.push(sub.id);
      } else {
        // The endpoint's host says which push service failed (FCM, Mozilla,
        // Apple) without logging the endpoint itself, which is a credential.
        let service = 'unknown';
        try {
          service = new URL(sub.endpoint).host;
        } catch {
          // keep 'unknown'
        }
        logger.warn('push.delivery_failed', { channel: 'web', statusCode, service, error: String(message).slice(0, 200) });
      }
    });
  }

  if (gone.length > 0) {
    await prisma.webPushSubscription.deleteMany({ where: { id: { in: gone } } });
    logger.info('push.web_subscriptions_pruned', { count: gone.length });
  }
  if (delivered.length > 0) {
    await prisma.webPushSubscription.updateMany({ where: { id: { in: delivered } }, data: { lastSuccessAt: new Date() } });
  }

  return { sent, failed, errors };
};

// Sends one notification to every user matching `where`, over every channel
// each of them has: the Expo token of the APK and any number of browser
// subscriptions. `teamSize` is how many users matched; `targeted` is how
// many of those had at least one channel to reach them on.
const notifyUsers = async (where, notification) => {
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      pushToken: true,
      webPushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });

  const expoTokens = [...new Set(users.map((u) => u.pushToken).filter(isExpoToken))];
  const webSubscriptions = users.flatMap((u) => u.webPushSubscriptions);
  const targeted = users.filter((u) => isExpoToken(u.pushToken) || u.webPushSubscriptions.length > 0).length;

  const [expo, web] = await Promise.all([
    sendPushNotifications(expoTokens, notification),
    sendWebPushNotifications(webSubscriptions, notification),
  ]);

  return {
    sent: expo.sent + web.sent,
    failed: expo.failed + web.failed,
    errors: [...expo.errors, ...web.errors],
    targeted,
    teamSize: users.length,
    registered: targeted,
    channels: { expo: expo.sent, web: web.sent },
  };
};

const notifyDepartmentWorkers = async (departmentId, notification) => {
  const result = await notifyUsers({ departmentId, role: 'worker', isActive: true }, notification);
  logger.info('push.department_targeted', {
    departmentId,
    targeted: result.targeted,
    teamSize: result.teamSize,
    sent: result.sent,
  });
  return result;
};

const notifyShiftWorkers = async (departmentId, shiftStart, shiftEnd, notification) => {
  const result = await notifyUsers({ departmentId, role: 'worker', isActive: true, shiftStart, shiftEnd }, notification);
  logger.info('push.shift_targeted', {
    departmentId,
    shiftStart,
    shiftEnd,
    targeted: result.targeted,
    teamSize: result.teamSize,
    sent: result.sent,
  });
  return result;
};

// Shift incharges and supervisors of one department (the people who see that
// department's polls in the incharge app).
const notifyDepartmentIncharges = async (departmentId, notification, { excludeUserId } = {}) => {
  const where = { departmentId, role: { in: ['incharge', 'supervisor'] }, isActive: true };
  if (excludeUserId) where.id = { not: excludeUserId };
  const result = await notifyUsers(where, notification);
  logger.info('push.incharges_targeted', { departmentId, targeted: result.targeted, sent: result.sent });
  return result;
};

// Selector + predicate shared by every screen that shows whether someone can
// currently be reached by a notification (incharge team list, HR workforce).
const notificationChannelSelect = {
  pushToken: true,
  _count: { select: { webPushSubscriptions: true } },
};

const hasNotificationChannel = (user) =>
  isExpoToken(user?.pushToken) || (user?._count?.webPushSubscriptions ?? 0) > 0;

// Prisma `where` fragment for "has at least one notification channel".
const reachableWhere = {
  OR: [{ pushToken: { startsWith: 'ExponentPushToken[' } }, { webPushSubscriptions: { some: {} } }],
};

module.exports = {
  sendPushNotifications,
  sendWebPushNotifications,
  notifyUsers,
  notifyDepartmentWorkers,
  notifyShiftWorkers,
  notifyDepartmentIncharges,
  notificationChannelSelect,
  hasNotificationChannel,
  reachableWhere,
  isExpoToken,
};
