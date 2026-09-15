const User = require('../models/User');

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
      console.error('[push] API error:', JSON.stringify(result));
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
      errors.push(message);
      console.error('[push] Delivery failed:', message, token);

      const errorCode = ticket?.details?.error || ticket?.code;
      if (errorCode === 'DeviceNotRegistered' && token) {
        await User.updateMany({ pushToken: token }, { $unset: { pushToken: 1 } });
      }
    }
  }

  return { sent, failed, errors };
};

const notifyDepartmentWorkers = async (departmentId, notification) => {
  const [allWorkers, registeredWorkers] = await Promise.all([
    User.find({
      department: departmentId,
      role: 'worker',
      isActive: true,
    }).select('employeeId name'),
    User.find({
      department: departmentId,
      role: 'worker',
      isActive: true,
      pushToken: { $exists: true, $nin: [null, ''] },
    }).select('pushToken name employeeId'),
  ]);

  const tokens = [...new Set(registeredWorkers.map((w) => w.pushToken).filter(Boolean))];
  const result = await sendPushNotifications(tokens, notification);

  if (registeredWorkers.length === 0) {
    console.log(
      `[push] No registered workers in department ${departmentId}. Team size: ${allWorkers.length}`
    );
  } else {
    console.log(
      `[push] Targeting ${registeredWorkers.length}/${allWorkers.length} workers in department ${departmentId}`
    );
  }

  return {
    ...result,
    targeted: registeredWorkers.length,
    teamSize: allWorkers.length,
    registered: registeredWorkers.length,
  };
};

const notifyShiftWorkers = async (departmentId, shiftStart, shiftEnd, notification) => {
  const [allWorkers, registeredWorkers] = await Promise.all([
    User.find({
      department: departmentId,
      role: 'worker',
      isActive: true,
      shiftStart,
      shiftEnd,
    }).select('employeeId name'),
    User.find({
      department: departmentId,
      role: 'worker',
      isActive: true,
      shiftStart,
      shiftEnd,
      pushToken: { $exists: true, $nin: [null, ''] },
    }).select('pushToken name employeeId'),
  ]);

  const tokens = [...new Set(registeredWorkers.map((w) => w.pushToken).filter(Boolean))];
  const result = await sendPushNotifications(tokens, notification);

  console.log(
    `[push] Shift ${shiftStart}–${shiftEnd}: targeting ${registeredWorkers.length}/${allWorkers.length} workers`
  );

  return {
    ...result,
    targeted: registeredWorkers.length,
    teamSize: allWorkers.length,
    registered: registeredWorkers.length,
  };
};

module.exports = { sendPushNotifications, notifyDepartmentWorkers, notifyShiftWorkers };
