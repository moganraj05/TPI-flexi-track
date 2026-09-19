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

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
};

module.exports = { corsOptions, allowedOrigins };
