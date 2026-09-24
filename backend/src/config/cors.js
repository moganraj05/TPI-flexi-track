// Origins allowed to call the API from a browser (webfrontend, and hrfrontend
// while it's still around). Mobile clients and server-to-server calls don't
// send an Origin header at all, so they're unaffected by this — CORS is a
// browser-only mechanism, this only ever gates fetch()/XHR from a web page.
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// No explicit allowlist in production means "allow nothing" (fail closed) —
// force a deliberate CORS_ALLOWED_ORIGINS instead of accidentally shipping
// an open API. In dev, default to the two local Vite ports so nothing breaks
// out of the box (hrfrontend :5173, webfrontend :5174).
const defaultDevOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const allowedOrigins =
  configuredOrigins.length > 0
    ? configuredOrigins
    : process.env.NODE_ENV === 'production'
      ? []
      : defaultDevOrigins;

// In dev only: also accept any origin on the two known Vite dev ports
// regardless of hostname — not just `localhost`, but the machine's LAN IP
// too (e.g. http://10.222.224.177:5174), since that's how a phone on the
// same WiFi/hotspot reaches a dev server, and that IP changes across
// sessions/reconnects. Still fails closed in production, where
// CORS_ALLOWED_ORIGINS must be set explicitly.
const DEV_PORTS = ['5173', '5174'];
function isDevLanOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && DEV_PORTS.includes(url.port);
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || isDevLanOrigin(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
};

module.exports = { corsOptions, allowedOrigins };
