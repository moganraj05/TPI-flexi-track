const prisma = require('../config/prisma');
const { getPollTimeMessage, autoCloseExpiredPolls } = require('../utils/poll');
const { ensurePollsForWorker } = require('../services/poll-automation.service');
const { isCurrentlyOnShift } = require('../utils/shift');
const { formatShiftName } = require('../config/shiftCatalog');
const { formatDept } = require('../utils/pollReport');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { emitPollUpdate } = require('../realtime');

const formatPoll = (poll, myResponse = null) => ({
  id: poll.id,
  title: poll.title,
  description: poll.description,
  date: poll.date,
  shift: poll.shift,
  shiftStart: poll.shiftStart || null,
  shiftEnd: poll.shiftEnd || null,
  status: poll.status,
  opensAt: poll.opensAt,
  closesAt: poll.closesAt,
  department: formatDept(poll.department),
  createdBy: poll.createdById || null,
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
    const deptId = req.user.departmentId;
    await autoCloseExpiredPolls({ departmentId: deptId });
    await ensurePollsForWorker(req.user, now);

    const where = {
      departmentId: deptId,
      status: 'open',
      opensAt: { lte: now },
      closesAt: { gt: now },
    };

    if (req.user.shiftStart && req.user.shiftEnd) {
      where.shiftStart = req.user.shiftStart;
      where.shiftEnd = req.user.shiftEnd;
    }

    const poll = await prisma.poll.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      include: { department: true },
    });

    if (!poll) {
      const onShift =
        req.user.shiftStart && req.user.shiftEnd
          ? isCurrentlyOnShift(now, req.user.shiftStart, req.user.shiftEnd)
          : false;
      const shiftLabel =
        req.user.shiftStart && req.user.shiftEnd
          ? formatShiftName(req.user.shiftStart, req.user.shiftEnd)
          : null;

      return res.json({
        success: true,
        data: null,
        message: onShift
          ? 'You are currently on shift. Your next attendance poll opens 30 minutes after this shift ends.'
          : 'No live attendance poll right now. Polls open 30 minutes after your shift ends and close 1 hour before the next shift.',
        meta: {
          shiftStart: req.user.shiftStart || null,
          shiftEnd: req.user.shiftEnd || null,
          shiftLabel,
          onShift,
        },
      });
    }

    const myResponse = await prisma.response.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId: req.user.id } },
    });

    res.json({
      success: true,
      data: formatPoll(poll, myResponse),
      meta: {
        shiftStart: req.user.shiftStart || null,
        shiftEnd: req.user.shiftEnd || null,
        shiftLabel:
          req.user.shiftStart && req.user.shiftEnd
            ? formatShiftName(req.user.shiftStart, req.user.shiftEnd)
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

    const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { department: true } });

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

    const userDeptId = req.user.departmentId;
    if (poll.departmentId !== userDeptId) {
      return res.status(403).json({ success: false, message: 'This poll is not for your department' });
    }

    if (!workerShiftMatchesPoll(req.user, poll)) {
      return res.status(403).json({ success: false, message: 'This poll is not for your shift timing' });
    }

    const response = await prisma.response.upsert({
      where: { pollId_userId: { pollId, userId: req.user.id } },
      create: { pollId, userId: req.user.id, answer, answeredAt: new Date() },
      update: { answer, answeredAt: new Date() },
    });

    emitPollUpdate({ pollId, departmentId: poll.departmentId, workerId: req.user.id, type: 'response' });

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
    // Keeps the previous 90-record window when no page/limit is sent, so the
    // installed mobile app behaves exactly as before.
    const pagination = parsePagination(req.query, { defaultLimit: 90 });

    const [total, responses] = await Promise.all([
      prisma.response.count({ where: { userId: req.user.id } }),
      prisma.response.findMany({
        where: { userId: req.user.id },
        orderBy: [{ answeredAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          poll: {
            select: {
              id: true,
              title: true,
              date: true,
              shift: true,
              shiftStart: true,
              shiftEnd: true,
              status: true,
              department: { select: { id: true, name: true, code: true, isActive: true } },
            },
          },
        },
      }),
    ]);

    const data = responses.map((r) => ({
      id: r.id,
      answer: r.answer,
      answeredAt: r.answeredAt,
      poll: r.poll
        ? {
            id: r.poll.id,
            title: r.poll.title,
            date: r.poll.date,
            shift: r.poll.shift,
            shiftStart: r.poll.shiftStart || null,
            shiftEnd: r.poll.shiftEnd || null,
            status: r.poll.status,
            department: formatDept(r.poll.department),
          }
        : null,
    }));

    res.json({ success: true, data, meta: buildMeta(pagination, total) });
  } catch (error) {
    next(error);
  }
};
