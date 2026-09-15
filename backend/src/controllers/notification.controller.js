exports.savePushToken = async (req, res, next) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken?.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ success: false, message: 'Invalid push token format' });
    }

    const User = require('../models/User');

    // One device token belongs to one worker account at a time.
    await User.updateMany(
      { pushToken, _id: { $ne: req.user._id } },
      { $unset: { pushToken: 1 } }
    );

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { pushToken },
      { new: true }
    ).select('employeeId name pushToken role');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`[push] Token saved for ${user.employeeId} (${user.name})`);

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
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { pushToken: 1 } },
      { new: true }
    ).select('employeeId');

    console.log(`[push] Token cleared for ${user?.employeeId}`);

    res.json({ success: true, message: 'Push token cleared' });
  } catch (error) {
    next(error);
  }
};

exports.getPushStatus = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('pushToken employeeId');

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
