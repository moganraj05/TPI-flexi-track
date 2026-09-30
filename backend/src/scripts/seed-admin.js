// Creates (or repairs) the initial FlexiTrack superadmin — the first account
// that can sign in to the HR console and approve self-registered HR logins.
// No email verification: this account is trusted by definition.
//
// Safe to re-run. If the account already exists it is made an active,
// approved superadmin again, but its password is left alone unless
// --reset-password is passed.
//
// The password is taken from ADMIN_SEED_PASSWORD when set; otherwise a strong
// random one is generated and printed once. It is never written to the repo.
//
//   npm run seed:admin
//   npm run seed:admin -- --reset-password
require('dotenv').config();
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/password');

const EMAIL = (process.env.ADMIN_SEED_EMAIL || 'moganrajg@tii.murugappa.com').trim().toLowerCase();
const NAME = process.env.ADMIN_SEED_NAME || 'Moganraj G';
const EMPLOYEE_ID = (process.env.ADMIN_SEED_EMPLOYEE_ID || 'ADMIN001').trim().toUpperCase();
const RESET_PASSWORD = process.argv.includes('--reset-password');

// 16 characters from an unambiguous alphabet, always with a letter and digit.
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let value = '';
  while (!(/[A-Za-z]/.test(value) && /\d/.test(value))) {
    value = Array.from({ length: 16 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  }
  return value;
}

async function run() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  const needsPassword = !existing || RESET_PASSWORD;
  const plainPassword = needsPassword ? process.env.ADMIN_SEED_PASSWORD || generatePassword() : null;

  const trustedFields = {
    role: 'superadmin',
    isActive: true,
    approvalStatus: 'approved',
    emailVerifiedAt: existing?.emailVerifiedAt || new Date(),
    approvedAt: existing?.approvedAt || new Date(),
  };

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...trustedFields,
        ...(plainPassword
          ? { password: await hashPassword(plainPassword), tokenVersion: { increment: 1 } }
          : {}),
      },
    });
    console.log(`Updated existing account ${EMAIL} -> active, approved superadmin.`);
  } else {
    const idTaken = await prisma.user.findUnique({ where: { employeeId: EMPLOYEE_ID } });
    if (idTaken) {
      console.error(`Employee ID ${EMPLOYEE_ID} is already used by another account. Set ADMIN_SEED_EMPLOYEE_ID and re-run.`);
      process.exit(1);
    }
    await prisma.user.create({
      data: {
        ...trustedFields,
        employeeId: EMPLOYEE_ID,
        name: NAME,
        email: EMAIL,
        phone: '',
        password: await hashPassword(plainPassword),
      },
    });
    console.log(`Created superadmin ${EMAIL} (Employee ID ${EMPLOYEE_ID}).`);
  }

  if (plainPassword) {
    console.log('');
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${plainPassword}`);
    console.log('');
    console.log('Sign in and change this password under Settings. It is not shown again.');
  } else {
    console.log('Password unchanged (pass --reset-password to set a new one).');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
