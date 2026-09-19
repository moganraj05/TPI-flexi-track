const prisma = require('../config/prisma');
const { emitPollUpdate } = require('../realtime');
const logger = require('./logger');

const isPollActive = (poll, now = new Date()) => {
  const opensAt = new Date(poll.opensAt);
  const closesAt = new Date(poll.closesAt);
  return poll.status === 'open' && opensAt <= now && closesAt > now;
};

const getPollTimeMessage = (poll, now = new Date()) => {
  const opensAt = new Date(poll.opensAt);
  const closesAt = new Date(poll.closesAt);

  if (poll.status !== 'open') return 'This poll is closed';
  if (opensAt > now) return 'This poll has not opened yet';
  if (closesAt <= now) return 'This poll has closed';
  return null;
};

const autoCloseExpiredPolls = async (filter = {}) => {
  const now = new Date();
  // This runs on nearly every poll-related read (HR/incharge screens poll
  // every few seconds, plus the reminder scheduler calls the unfiltered form
  // on its own tick) — so two callers routinely see the same expiring poll
  // as still "open" at the same moment. The select below is just to find
  // candidates; the actual close has to be a per-poll conditional update (not
  // a single findMany-then-batch-updateMany) so only the caller that actually
  // flips open->closed emits the event — otherwise every concurrent caller
  // would re-close (harmlessly) but *also* re-emit poll:update for the same
  // closure, which is a real duplicate-event bug even though the DB state
  // itself never becomes inconsistent.
  const expiring = await prisma.poll.findMany({
    where: { ...filter, status: 'open', closesAt: { lte: now } },
    select: { id: true, departmentId: true },
  });
  if (expiring.length === 0) return;

  for (const poll of expiring) {
    const claimed = await prisma.poll.updateMany({
      where: { id: poll.id, status: 'open' },
      data: { status: 'closed' },
    });
    // count === 0 means another concurrent call (or the same request path
    // re-entering) already closed this exact poll a moment ago — nothing
    // left to do or announce.
    if (claimed.count === 0) continue;

    logger.info('poll.auto_closed', { pollId: poll.id, departmentId: poll.departmentId });
    emitPollUpdate({ pollId: poll.id, departmentId: poll.departmentId, type: 'closed' });
  }
};

module.exports = { isPollActive, getPollTimeMessage, autoCloseExpiredPolls };
