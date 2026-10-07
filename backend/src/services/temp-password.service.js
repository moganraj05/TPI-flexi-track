const crypto = require('crypto');
const { hashPassword, comparePassword } = require('../utils/password');

// Temporary passwords for the worker app (workers, incharges, supervisors).
//
// Every new account and every password reset gets its own random temporary
// password instead of a shared default like "password123" (which let anyone
// who knew a colleague's Employee ID sign in as them). It is shown once to
// whoever created/reset the account, works until it expires, and the person
// must set their own password on first sign-in (mustChangePassword).

// No look-alike characters (0/O, 1/I/L), so it can be read out over the phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// New accounts: people may not sign in straight away. Resets: used soon.
const TEMP_TTL_MS = {
  new_account: 7 * 24 * 60 * 60 * 1000,
  reset: 24 * 60 * 60 * 1000,
};

// "K7MQ-42XA" — 8 random characters (about 40 bits), grouped for reading out.
function generateTempPassword() {
  const chars = Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

// Prisma `data` for setting a temporary password. `plain` defaults to a
// freshly generated one; returns the plain password (to show once) too.
async function tempPasswordData(kind, plain = generateTempPassword()) {
  const expiresAt = new Date(Date.now() + TEMP_TTL_MS[kind]);
  return {
    plain,
    expiresAt,
    data: {
      password: await hashPassword(plain),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
    },
  };
}

// Rules for a password a worker/incharge chooses themselves. Returns a
// user-facing problem, or null when it's acceptable.
async function ownPasswordProblem(newPassword, user, currentHash) {
  const pw = String(newPassword || '');
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 72) return 'Password must be at most 72 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number';

  const lower = pw.toLowerCase();
  if (user.employeeId && lower.includes(user.employeeId.toLowerCase())) return "Password can't contain your Employee ID";
  const phoneDigits = String(user.phone || '').replace(/\D/g, '');
  if (phoneDigits.length >= 6 && pw.replace(/\D/g, '').includes(phoneDigits.slice(-6))) {
    return "Password can't contain your phone number";
  }
  if (['password', 'flexitrack', '12345678', 'qwerty12'].some((weak) => lower.includes(weak))) {
    return 'Choose a less common password';
  }
  if (currentHash && (await comparePassword(pw, currentHash))) {
    return 'Choose a password different from your current or temporary one';
  }
  return null;
}

module.exports = { generateTempPassword, tempPasswordData, ownPasswordProblem, TEMP_TTL_MS };
