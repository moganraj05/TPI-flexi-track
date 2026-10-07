const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

// Every sign-in gets its own session id (sid), so "Log out" can end just that
// device's session (revoked_sessions) while the person stays signed in on
// their other devices. tokenVersion is the "sign out everywhere" switch
// (password change / reset bumps it).
//
// Stay signed in until logging out: tokens last JWT_EXPIRES_IN (365 days) and
// are renewed while the app is used (GET /me hands out a fresh one when the
// current one is older than RENEW_AFTER), so an active user never expires.
// algorithm pinned explicitly (matched by `algorithms` on every verify call)
// so a token can never be accepted under a different algorithm.
const RENEW_AFTER_SECONDS = 30 * 24 * 60 * 60;

const signToken = (user, sid = crypto.randomUUID()) =>
  jwt.sign({ id: user.id, tokenVersion: user.tokenVersion || 0, sid }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '365d',
    algorithm: 'HS256',
  });

const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

// Tokens issued before session ids existed are identified by user + issue time.
const sessionKey = (decoded) => decoded.sid || `${decoded.id}:${decoded.iat}`;

const isSessionRevoked = async (decoded) =>
  !!(await prisma.revokedSession.findUnique({ where: { key: sessionKey(decoded) }, select: { key: true } }));

// Ends one session (the one this token belongs to). Old revocations whose
// token would have expired anyway are cleared out at the same time.
async function revokeSession(decoded, userId) {
  const expiresAt = new Date((decoded.exp || Math.floor(Date.now() / 1000) + 365 * 86400) * 1000);
  await prisma.revokedSession.upsert({
    where: { key: sessionKey(decoded) },
    create: { key: sessionKey(decoded), userId, expiresAt },
    update: {},
  });
  await prisma.revokedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

// A fresh token for the same session when the current one is getting old, so
// someone who keeps using the app is never signed out by expiry.
const renewedToken = (user, decoded) =>
  decoded && Date.now() / 1000 - (decoded.iat || 0) > RENEW_AFTER_SECONDS ? signToken(user, decoded.sid) : undefined;

module.exports = { signToken, verifyToken, sessionKey, isSessionRevoked, revokeSession, renewedToken };
