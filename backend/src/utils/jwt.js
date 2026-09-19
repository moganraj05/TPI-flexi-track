const jwt = require('jsonwebtoken');

const signToken = (user) =>
  jwt.sign(
    { id: user.id, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    // Stay signed in until the user logs out (mobile stores token in SecureStore).
    // Long expiry is safe here because tokenVersion is the real revocation
    // mechanism: logout bumps it, instantly invalidating every token already
    // issued for that user regardless of how much of its expiry is left.
    // algorithm pinned explicitly (matched by `algorithms` on every verify
    // call) so a token can never be accepted under a different algorithm
    // than the one this app actually signs with.
    { expiresIn: process.env.JWT_EXPIRES_IN || '365d', algorithm: 'HS256' }
  );

module.exports = { signToken };
