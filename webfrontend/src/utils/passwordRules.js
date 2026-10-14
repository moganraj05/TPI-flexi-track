// The password rule for every password someone chooses (both apps) — mirrors
// backend/src/utils/passwordRules.js, which is what actually enforces it;
// this only drives the live checklists and early messages.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 32;

export const PASSWORD_RULES = [
  { key: 'length', label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`, test: (v) => v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX },
  { key: 'upper', label: 'An uppercase letter (A–Z)', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'A lowercase letter (a–z)', test: (v) => /[a-z]/.test(v) },
  { key: 'special', label: 'A special character (e.g. @ # $ !)', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
];

export const PASSWORD_HINT = `${PASSWORD_MIN}–${PASSWORD_MAX} characters with an uppercase letter, a lowercase letter and a special character.`;

export const SAME_AS_OLD_MESSAGE = 'New password must be different from your old password';

export const meetsPasswordRules = (value) => PASSWORD_RULES.every((r) => r.test(String(value || '')));
