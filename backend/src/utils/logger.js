const { AsyncLocalStorage } = require('node:async_hooks');

// One line of structured JSON per event instead of scattered printf-style
// strings, so logs are grep/parse-able (by requestId, event, userId, etc.)
// without pulling in a logging library. Everything downstream of the request
// middleware — controllers, services, the error handler, and even the
// realtime layer for controller-triggered emits — shares the same
// requestId/userId via AsyncLocalStorage, so a single operation can be
// traced end to end without threading req through every function call.
const als = new AsyncLocalStorage();

// Values behind these keys are replaced wherever they appear in logged
// metadata, at any nesting depth — this is the one place that policy lives,
// so a new call site can't accidentally leak a secret by forgetting to trim
// its own payload before logging it.
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'authorization',
  'pushtoken',
  'jwt',
  'refreshtoken',
  'otp',
  'ticket',
  'codehash',
  'api-key',
]);

const REDACTED = '[redacted]';

function redact(value, seen) {
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val, seen);
    }
    return out;
  }

  return value;
}

function currentContext() {
  return als.getStore() || {};
}

function write(level, event, meta) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...currentContext(),
    ...redact(meta || {}, new WeakSet()),
  };

  const json = JSON.stringify(line);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(json + '\n');
  } else {
    process.stdout.write(json + '\n');
  }
}

const logger = {
  info: (event, meta) => write('info', event, meta),
  warn: (event, meta) => write('warn', event, meta),
  error: (event, meta) => write('error', event, meta),

  // Runs fn with `context` (e.g. { requestId, source }) visible to every
  // logger.* call made anywhere in its async chain, including ones inside
  // functions that never receive that context as an argument.
  runWithContext: (context, fn) => als.run(context, fn),

  // Lets middleware further down the same chain (e.g. auth, once it knows
  // who the caller is) enrich the already-running context in place, rather
  // than needing to re-wrap in a nested runWithContext.
  extendContext: (patch) => {
    const store = als.getStore();
    if (store) Object.assign(store, patch);
  },

  getRequestId: () => currentContext().requestId,
};

module.exports = logger;
