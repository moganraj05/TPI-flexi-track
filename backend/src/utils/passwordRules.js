// The one password rule for every password a person chooses: worker /
// incharge setting their own (first sign-in, after a reset, from Profile),
// staff self-registration, invitation, email reset and Settings, and
// passwords typed by HR / incharges. (System-generated temporary passwords
// are exempt.) Mirrored for live hints in webfrontend/src/utils/passwordRules.js.
//
//   8–32 characters, at least one uppercase letter, one lowercase letter and
//   one special character — and not the same as the current password
//   (checked where the old password is known).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 32;

function passwordRuleProblem(value) {
  const pw = String(value ?? '');
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter';
  if (!/[^A-Za-z0-9\s]/.test(pw)) return 'Password must contain a special character (e.g. @ # $ !)';
  return null;
}

const SAME_AS_OLD_MESSAGE = 'New password must be different from your old password';

module.exports = { PASSWORD_MIN, PASSWORD_MAX, passwordRuleProblem, SAME_AS_OLD_MESSAGE };
