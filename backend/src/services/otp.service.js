const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 10;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60;
const OTP_MAX_PER_HOUR = Number(process.env.OTP_MAX_PER_HOUR) || 5;
// How long the user has, after entering a correct code, to finish the
// set-password step before having to start over.
const TICKET_TTL_MINUTES = 15;

// OTP rows older than this past their expiry are deleted opportunistically
// on the next send — they only matter for the per-hour send limit.
const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;

// Ticket signing key is derived from JWT_SECRET but distinct from it, so a
// verification ticket can never be accepted as a login token (or vice versa).
const ticketSecret = () =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update('flexitrack:otp-ticket').digest();

// The code is bound to its email and purpose: a hash leaked from one row
// can't be replayed against another email or the other flow.
const hashCode = (email, purpose, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${purpose}:${email}:${code}`).digest('hex');

const safeEqualHex = (a, b) => {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

class OtpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Creates a fresh code for email+purpose, retiring any earlier live one.
// Returns { code, otpId } or throws OtpError(429) when the resend cooldown or
// hourly cap applies. The per-email advisory lock serializes concurrent
// sends for the same address, so two quick clicks can't both slip past the
// cooldown check.
async function issueOtp({ email, purpose, payload = null, requestIp = null }) {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`otp:${purpose}:${email}`}))`;

    const recent = await tx.emailOtp.findMany({
      where: { email, purpose, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (recent.length > 0) {
      const sinceLast = (now.getTime() - recent[0].createdAt.getTime()) / 1000;
      if (sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
        const retryAfter = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast);
        throw new OtpError(429, `Please wait ${retryAfter} seconds before requesting another code.`, { retryAfter });
      }
    }
    if (recent.length >= OTP_MAX_PER_HOUR) {
      throw new OtpError(429, 'Too many codes requested for this email. Please try again in an hour.');
    }

    await tx.emailOtp.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: now },
    });

    const code = generateCode();
    const otp = await tx.emailOtp.create({
      data: {
        email,
        purpose,
        codeHash: hashCode(email, purpose, code),
        payload,
        requestIp,
        expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
      },
      select: { id: true },
    });
    return { code, otpId: otp.id };
  });

  prisma.emailOtp
    .deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - CLEANUP_AFTER_MS) } } })
    .catch(() => {});

  return result;
}

// Called when the email could not be sent, so the failed attempt doesn't
// hold the user in the resend cooldown for a code they never received.
async function discardOtp(otpId) {
  await prisma.emailOtp.delete({ where: { id: otpId } }).catch(() => {});
}

const INVALID_CODE = 'Invalid or expired code. Please check the code or request a new one.';

// Checks a submitted code against the latest live OTP for email+purpose.
// On success marks it verified and returns a short-lived ticket that the
// final step (create account / set new password) must present.
async function verifyOtp({ email, purpose, code }) {
  const now = new Date();
  const otp = await prisma.emailOtp.findFirst({
    where: { email, purpose, consumedAt: null, verifiedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) throw new OtpError(400, INVALID_CODE);

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: now } });
    throw new OtpError(400, 'Too many incorrect attempts. Please request a new code.');
  }

  if (!safeEqualHex(otp.codeHash, hashCode(email, purpose, String(code)))) {
    // Conditional increment: concurrent wrong guesses can't push past the cap.
    const { count } = await prisma.emailOtp.updateMany({
      where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - otp.attempts - count);
    if (remaining === 0) {
      await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: now } });
      throw new OtpError(400, 'Too many incorrect attempts. Please request a new code.');
    }
    throw new OtpError(400, `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`, { remaining });
  }

  const { count } = await prisma.emailOtp.updateMany({
    where: { id: otp.id, verifiedAt: null, consumedAt: null },
    data: { verifiedAt: now },
  });
  if (count !== 1) throw new OtpError(400, INVALID_CODE);

  const ticket = jwt.sign({ otpId: otp.id, email, purpose, typ: 'otp_ticket' }, ticketSecret(), {
    expiresIn: `${TICKET_TTL_MINUTES}m`,
    algorithm: 'HS256',
  });
  return { ticket, expiresInMinutes: TICKET_TTL_MINUTES };
}

// Validates a ticket for the given purpose and returns its (verified, not yet
// consumed) OTP row. It does not consume it — the caller does that inside the
// same transaction as its own write, via consumeOtpInTx.
async function readTicket(ticket, purpose) {
  let decoded;
  try {
    decoded = jwt.verify(String(ticket || ''), ticketSecret(), { algorithms: ['HS256'] });
  } catch {
    throw new OtpError(400, 'Your verification has expired. Please start again.');
  }
  if (decoded.typ !== 'otp_ticket' || decoded.purpose !== purpose) {
    throw new OtpError(400, 'Invalid verification. Please start again.');
  }

  const otp = await prisma.emailOtp.findUnique({ where: { id: decoded.otpId } });
  if (!otp || otp.email !== decoded.email || otp.purpose !== purpose || !otp.verifiedAt || otp.consumedAt) {
    throw new OtpError(400, 'This verification has already been used or is no longer valid. Please start again.');
  }
  return otp;
}

// Single-use guarantee: only the first of two concurrent submissions of the
// same ticket gets count === 1; the other's whole transaction rolls back.
async function consumeOtpInTx(tx, otpId) {
  const { count } = await tx.emailOtp.updateMany({
    where: { id: otpId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count !== 1) {
    throw new OtpError(400, 'This verification has already been used. Please start again.');
  }
}

module.exports = {
  OtpError,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  issueOtp,
  discardOtp,
  verifyOtp,
  readTicket,
  consumeOtpInTx,
};
