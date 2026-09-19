const prisma = require('../config/prisma');
const logger = require('../utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const parseTickets = (result) => {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data) return [result.data];
  if (Array.isArray(result?.errors)) return result.errors;
  return [];
};

const sendPushNotifications = async (tokens, { title, body, data = {} }) => {
  const validTokens = tokens.filter((t) => t && t.startsWith('ExponentPushToken['));
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
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });

    const result = await response.json();
    const tickets = parseTickets(result);

    if (tickets.length === 0) {
      failed += chunk.length;
      const message = result?.errors?.[0]?.message || 'Expo push API returned no tickets';
      errors.push(message);
      // Never the token itself — chunkSize is enough to see the blast radius.
      logger.error('push.api_error', { error: message, chunkSize: chunk.length });
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
      logger.warn('push.delivery_failed', { errorCode, error: message });

      if (errorCode === 'DeviceNotRegistered' && token) {
        await prisma.user.updateMany({ where: { pushToken: token }, data: { pushToken: null } });
      }
    }
  }

  return { sent, failed, errors };
};

const notifyDepartmentWorkers = async (departmentId, notification) => {
  const [allWorkers, registeredWorkers] = await Promise.all([
    prisma.user.findMany({
      where: { departmentId, role: 'worker', isActive: true },
      select: { employeeId: true, name: true },
    }),
    prisma.user.findMany({
      where: { departmentId, role: 'worker', isActive: true, NOT: [{ pushToken: null }, { pushToken: '' }] },
      select: { pushToken: true, name: true, employeeId: true },
    }),
  ]);

  const tokens = [...new Set(registeredWorkers.map((w) => w.pushToken).filter(Boolean))];
  const result = await sendPushNotifications(tokens, notification);

  logger.info('push.department_targeted', {
    departmentId,
    targeted: registeredWorkers.length,
    teamSize: allWorkers.length,
  });

  return {
    ...result,
    targeted: registeredWorkers.length,
    teamSize: allWorkers.length,
    registered: registeredWorkers.length,
  };
};

const notifyShiftWorkers = async (departmentId, shiftStart, shiftEnd, notification) => {
  const [allWorkers, registeredWorkers] = await Promise.all([
    prisma.user.findMany({
      where: { departmentId, role: 'worker', isActive: true, shiftStart, shiftEnd },
      select: { employeeId: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        departmentId,
        role: 'worker',
        isActive: true,
        shiftStart,
        shiftEnd,
        NOT: [{ pushToken: null }, { pushToken: '' }],
      },
      select: { pushToken: true, name: true, employeeId: true },
    }),
  ]);

  const tokens = [...new Set(registeredWorkers.map((w) => w.pushToken).filter(Boolean))];
  const result = await sendPushNotifications(tokens, notification);

  logger.info('push.shift_targeted', {
    departmentId,
    shiftStart,
    shiftEnd,
    targeted: registeredWorkers.length,
    teamSize: allWorkers.length,
  });

  return {
    ...result,
    targeted: registeredWorkers.length,
    teamSize: allWorkers.length,
    registered: registeredWorkers.length,
  };
};

module.exports = { sendPushNotifications, notifyDepartmentWorkers, notifyShiftWorkers };
