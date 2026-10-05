const prisma = require('../config/prisma');
const logger = require('../utils/logger');
const { summarizePollCounts } = require('../utils/pollReport');
const { notifyDepartmentIncharges } = require('./notification.service');

// Tells the department's incharges/supervisors that a poll has closed, with
// the final head count — the moment they need it to plan the shift. Called
// exactly once per poll, by whichever path actually flipped it to closed
// (the scheduled auto-close or an incharge closing it early, who is then
// left out since they just did it themselves).
//
// Fire-and-forget by design: it runs after the close is committed, never
// blocks the request or scheduler tick that closed the poll, and logs
// instead of throwing.
function notifyPollClosed(pollId, { excludeUserId } = {}) {
  run(pollId, excludeUserId).catch((error) => {
    logger.error('push.poll_closed_notify_failed', { pollId, error: error.message });
  });
}

async function run(pollId, excludeUserId) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { id: true, departmentId: true, shift: true, shiftStart: true, shiftEnd: true, date: true },
  });
  if (!poll) return;

  const counts = (await summarizePollCounts([poll])).get(poll.id);
  if (!counts || counts.totalWorkers === 0) return;

  await notifyDepartmentIncharges(
    poll.departmentId,
    {
      title: `Poll closed: ${poll.shift}`,
      body: `${counts.coming} coming, ${counts.notComing} not coming, ${counts.pending} no response (of ${counts.totalWorkers}).`,
      data: { pollId: poll.id, type: 'poll_closed' },
      url: `/incharge/poll/${poll.id}`,
      tag: `poll-closed-${poll.id}`,
      ttlSeconds: 6 * 60 * 60,
    },
    { excludeUserId }
  );
}

module.exports = { notifyPollClosed };
