const Poll = require('../models/Poll');
const Response = require('../models/Response');
const { getPollTimeMessage, autoCloseExpiredPolls } = require('../utils/poll');
const { ensurePollsForWorker } = require('../services/poll-automation.service');
const { isCurrentlyOnShift, formatShiftLabel } = require('../utils/shift');

const formatPoll = (poll, myResponse = null) => ({
  id: poll._id,
  title: poll.title,
  description: poll.description,
  date: poll.date,
  shift: poll.shift,
  shiftStart: poll.shiftStart || null,
  shiftEnd: poll.shiftEnd || null,
  status: poll.status,
  opensAt: poll.opensAt,
  closesAt: poll.closesAt,
  department: poll.department,
  createdBy: poll.createdBy,
  autoCreated: poll.autoCreated !== false,
  myResponse: myResponse
    ? { answer: myResponse.answer, answeredAt: myResponse.answeredAt }
    : null,
});

const workerShiftMatchesPoll = (user, poll) => {
  if (!poll.shiftStart || !poll.shiftEnd) return true;
  return user.shiftStart === poll.shiftStart && user.shiftEnd === poll.shiftEnd;
};

exports.getTodayPoll = async (req, res, next) => {
  try {
    const now = new Date();
    const deptId = req.user.department._id || req.user.department;
    await autoCloseExpiredPolls({ department: deptId });
    await ensurePollsForWorker(req.user, now);

    const filter = {
      department: deptId,
      status: 'open',
      opensAt: { $lte: now },
      closesAt: { $gt: now },
    };

    if (req.user.shiftStart && req.user.shiftEnd) {
      filter.shiftStart = req.user.shiftStart;
      filter.shiftEnd = req.user.shiftEnd;
    }

    const poll = await Poll.findOne(filter)
      .sort({ createdAt: -1 })
      .populate('department', 'name code');

    if (!poll) {
      const onShift =
        req.user.shiftStart && req.user.shiftEnd
          ? isCurrentlyOnShift(now, req.user.shiftStart, req.user.shiftEnd)
          : false;
      const shiftLabel =
        req.user.shiftStart && req.user.shiftEnd
          ? formatShiftLabel(req.user.shiftStart, req.user.shiftEnd)
          : null;

      return res.json({
        success: true,
        data: null,
        message: onShift
          ? 'You are currently on shift. Your next attendance poll opens 30 minutes after this shift ends.'
          : 'No live attendance poll right now. Polls open 30 minutes after your shift ends and close 2 hours before the next shift.',
        meta: {
          shiftStart: req.user.shiftStart || null,
          shiftEnd: req.user.shiftEnd || null,
          shiftLabel,
          onShift,
        },
      });
    }

    const myResponse = await Response.findOne({ poll: poll._id, user: req.user._id });

    res.json({
      success: true,
      data: formatPoll(poll, myResponse),
      meta: {
        shiftStart: req.user.shiftStart || null,
        shiftEnd: req.user.shiftEnd || null,
        shiftLabel:
          req.user.shiftStart && req.user.shiftEnd
            ? formatShiftLabel(req.user.shiftStart, req.user.shiftEnd)
            : null,
        onShift:
          req.user.shiftStart && req.user.shiftEnd
            ? isCurrentlyOnShift(now, req.user.shiftStart, req.user.shiftEnd)
            : false,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.respondToPoll = async (req, res, next) => {
  try {
    const { answer } = req.body;
    const { pollId } = req.params;

    if (!['yes', 'no'].includes(answer)) {
      return res.status(400).json({ success: false, message: 'Answer must be yes or no' });
    }

    const poll = await Poll.findById(pollId).populate('department', 'name code');

    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found' });
    }

    if (poll.status !== 'open') {
      return res.status(400).json({ success: false, message: 'This poll is closed' });
    }

    const timeMessage = getPollTimeMessage(poll);
    if (timeMessage) {
      return res.status(400).json({ success: false, message: timeMessage });
    }

    const userDeptId = (req.user.department._id || req.user.department).toString();
    if (poll.department._id.toString() !== userDeptId) {
      return res.status(403).json({ success: false, message: 'This poll is not for your department' });
    }

    if (!workerShiftMatchesPoll(req.user, poll)) {
      return res.status(403).json({ success: false, message: 'This poll is not for your shift timing' });
    }

    const response = await Response.findOneAndUpdate(
      { poll: pollId, user: req.user._id },
      { answer, answeredAt: new Date() },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Response recorded',
      data: formatPoll(poll, response),
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyResponses = async (req, res, next) => {
  try {
    const responses = await Response.find({ user: req.user._id })
      .sort({ answeredAt: -1 })
      .limit(90)
      .populate({
        path: 'poll',
        select: 'title date shift shiftStart shiftEnd status department',
        populate: { path: 'department', select: 'name code' },
      });

    const data = responses.map((r) => ({
      id: r._id,
      answer: r.answer,
      answeredAt: r.answeredAt,
      poll: r.poll
        ? {
            id: r.poll._id,
            title: r.poll.title,
            date: r.poll.date,
            shift: r.poll.shift,
            shiftStart: r.poll.shiftStart || null,
            shiftEnd: r.poll.shiftEnd || null,
            status: r.poll.status,
            department: r.poll.department,
          }
        : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
