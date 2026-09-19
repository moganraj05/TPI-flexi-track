const prisma = require('../config/prisma');
const logger = require('../utils/logger');

exports.savePushToken = async (req, res, next) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken?.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ success: false, message: 'Invalid push token format' });
    }

    // One device token belongs to one worker account at a time.
    await prisma.user.updateMany({
      where: { pushToken, id: { not: req.user.id } },
      data: { pushToken: null },
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken },
      select: { employeeId: true, pushToken: true, role: true },
    });

    // employeeId (a badge number, not a name/phone/email) is the only
    // identifier here — logger.js would redact `pushToken` anyway, but the
    // token isn't diagnostically useful in a log either way.
    logger.info('push.token_saved', { userId: req.user.id, employeeId: user.employeeId });

    res.json({
      success: true,
      message: 'Push token saved',
      data: { registered: true, pushToken: user.pushToken },
    });
  } catch (error) {
    next(error);
  }
};

exports.clearPushToken = async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken: null },
      select: { employeeId: true },
    });

    logger.info('push.token_cleared', { userId: req.user.id, employeeId: user?.employeeId });

    res.json({ success: true, message: 'Push token cleared' });
  } catch (error) {
    next(error);
  }
};

exports.getPushStatus = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { pushToken: true, employeeId: true },
    });

    const pushToken = user?.pushToken?.startsWith('ExponentPushToken[') ? user.pushToken : null;

    res.json({
      success: true,
      data: {
        registered: !!pushToken,
        employeeId: user?.employeeId,
        pushToken,
      },
    });
  } catch (error) {
    next(error);
  }
};
