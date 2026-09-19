const rateLimit = require('express-rate-limit');

// Three tiers:
//  - loginLimiter: tight, per-IP, on the two password-check endpoints —
//    the classic brute-force target.
//  - sensitiveLimiter: looser, on account/credential-management writes
//    (creating workers/incharges/HR logins, password changes, plant CRUD).
//    These are HR/incharge-only actions, done by a handful of people, never
//    by the worker-scale traffic.
//  - apiLimiter: a broad backstop across all of /api, sized generously for
//    300-400 workers polling around shift changes. Note this counts per
//    source IP — if every device on a factory Wi-Fi ends up sharing one
//    public IP behind a router/NAT (e.g. a cloud-hosted backend reached over
//    the internet instead of the same LAN), raise RATE_LIMIT_API_MAX rather
//    than leaving everyone behind one shared bucket.
const loginLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

const sensitiveLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_SENSITIVE_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SENSITIVE_MAX) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again shortly.' },
});

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_API_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API_MAX) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

module.exports = { loginLimiter, sensitiveLimiter, apiLimiter };
