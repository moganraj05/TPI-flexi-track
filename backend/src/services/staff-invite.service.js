const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { allowedOrigins } = require('../config/cors');

// Staff / admin logins created by an admin have no usable password. The
// person gets an invitation email with a link to set their own; until then
// they can't sign in.
//
// The link carries a signed token (not stored anywhere) that is:
//  - tied to one account and its tokenVersion — setting the password bumps
//    tokenVersion, so a link works once; "Resend invitation" bumps it too,
//    so any older link stops working;
//  - valid for INVITE_TTL_HOURS;
//  - signed with a key derived from JWT_SECRET but distinct from it, so it
//    can never be used as a sign-in token (or the other way round).
// It sits in the URL fragment (#token=...), which browsers never send to a
// server, so it doesn't end up in any access log.

const INVITE_TTL_HOURS = 72;

const inviteSecret = () => crypto.createHmac('sha256', process.env.JWT_SECRET).update('flexitrack:staff-invite').digest();

class InviteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createInviteToken(user) {
  return jwt.sign({ uid: user.id, tv: user.tokenVersion || 0, typ: 'staff_invite' }, inviteSecret(), {
    expiresIn: `${INVITE_TTL_HOURS}h`,
    algorithm: 'HS256',
  });
}

// The address people open FlexiTrack at, for links in emails:
// PUBLIC_APP_URL if set, else the admin's own browser address when it's an
// allowed origin, else the first allowed origin.
function appBaseUrl(req) {
  const configured = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const origin = (req?.get?.('origin') || '').toLowerCase();
  if (origin && allowedOrigins.includes(origin)) return origin;
  return allowedOrigins[0] || 'http://localhost:5174';
}

const inviteLink = (req, token) => `${appBaseUrl(req)}/staff/set-password#token=${encodeURIComponent(token)}`;

// Returns the account the token belongs to, or throws InviteError with a
// message the set-password page can show as-is.
async function readInviteToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(String(token || ''), inviteSecret(), { algorithms: ['HS256'] });
  } catch (error) {
    throw new InviteError(
      400,
      error.name === 'TokenExpiredError'
        ? 'This invitation link has expired. Ask your admin to send a new invitation.'
        : 'This invitation link is not valid. Use the latest invitation email, or ask your admin to send a new one.'
    );
  }
  if (decoded.typ !== 'staff_invite') throw new InviteError(400, 'This invitation link is not valid.');

  const user = await prisma.user.findUnique({
    where: { id: decoded.uid },
    select: { id: true, name: true, email: true, employeeId: true, role: true, isActive: true, tokenVersion: true, mustSetPassword: true },
  });
  if (!user || !user.isActive) throw new InviteError(400, 'This account is no longer active. Please contact your admin.');
  if (!user.mustSetPassword) {
    throw new InviteError(409, 'A password has already been set for this account. Sign in, or use “Forgot password?”.');
  }
  if ((decoded.tv || 0) !== (user.tokenVersion || 0)) {
    throw new InviteError(400, 'This invitation link has been replaced by a newer one. Use the latest invitation email.');
  }
  return user;
}

module.exports = { INVITE_TTL_HOURS, InviteError, createInviteToken, inviteLink, readInviteToken };
