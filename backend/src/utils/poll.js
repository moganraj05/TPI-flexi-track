const Poll = require('../models/Poll');

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
  await Poll.updateMany(
    { ...filter, status: 'open', closesAt: { $lte: now } },
    { $set: { status: 'closed' } }
  );
};

module.exports = { isPollActive, getPollTimeMessage, autoCloseExpiredPolls };
