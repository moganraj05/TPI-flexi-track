require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const prisma = require('./config/prisma');
const { corsOptions } = require('./config/cors');
const { getShiftCatalog } = require('./config/shiftCatalog');
const { apiLimiter } = require('./middleware/rateLimiters');
const requestContext = require('./middleware/requestContext');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const inchargeRoutes = require('./routes/incharge.routes');
const hrRoutes = require('./routes/hr.routes');
const { startReminderScheduler } = require('./services/reminder.service');
const { startPollAutomation } = require('./services/poll-automation.service');
const { initRealtime } = require('./realtime');

const app = express();
// Socket.IO needs the raw http.Server (it upgrades HTTP connections to
// WebSocket), so the app is handed to one explicitly instead of using
// app.listen(), which creates and hides one internally.
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Off by default (spoofable X-Forwarded-For otherwise defeats per-IP rate
// limiting). Set TRUST_PROXY to the number of hops in front of this process
// (usually 1) when it's actually behind a reverse proxy/load balancer.
const trustProxy = Number(process.env.TRUST_PROXY) || 0;
if (trustProxy > 0) app.set('trust proxy', trustProxy);

// First, ahead of everything else — so every request, including one CORS or
// the rate limiter rejects before it ever reaches a route, still gets a
// correlation ID and a logged outcome.
app.use(requestContext);

app.use(
  helmet({
    // Pure JSON API, no HTML/browser rendering happens here — a CSP header
    // has nothing to protect on this origin.
    contentSecurityPolicy: false,
    // This API is deliberately called cross-origin by the web frontends
    // (:5173/:5174 in dev, a separate origin in production). Helmet's
    // same-origin default for this header makes Chrome block the response
    // body on cross-origin fetch/XHR reads even when CORS allows it — so it
    // has to be relaxed here, not left at the default.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.BODY_LIMIT || '100kb' }));
app.use('/api', apiLimiter);

// Liveness only — deliberately just "is the process up", no DB call. The
// mobile app hammers this concurrently across an entire /24 subnet during
// LAN discovery (services/serverDiscovery.ts) with a 350ms timeout per host;
// a DB round-trip here would slow that scan down for every device on the
// network, not just diagnose this one.
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'FlexiTrack API is running' });
});

// Readiness — for ops/orchestration (a process manager, load balancer, or
// deploy script) to confirm the app can actually serve real requests, not
// just that the process is listening. Not called by either frontend or the
// mobile app's discovery scan.
app.get('/api/health/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, message: 'Ready', data: { database: 'up' } });
  } catch (error) {
    logger.error('health.not_ready', { error: error.message });
    res.status(503).json({ success: false, message: 'Not ready', data: { database: 'down' } });
  }
});

// Static reference data (the fixed 5-shift catalog) — unauthenticated like
// /api/health since webfrontend, incharge mobile, and worker mobile all need
// it and it carries nothing sensitive, so one public endpoint beats
// registering the same read three times behind three different auth chains.
app.get('/api/shifts', (req, res) => {
  res.json({ success: true, data: getShiftCatalog() });
});

app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/incharge', inchargeRoutes);
app.use('/api/hr', hrRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found', requestId: req.id });
});

app.use(errorHandler);

// A crash in one request handler (or scheduler tick) shouldn't be able to
// take the whole process down silently while 300-400 workers are connected.
// unhandledRejection is logged and left running; uncaughtException means the
// process is in an unknown state, so it logs and exits for a supervisor
// (nodemon/pm2) to restart clean, rather than limping on corrupted.
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
process.on('uncaughtException', (err) => {
  logger.error('process.uncaught_exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Populated once the schedulers actually start (inside server.listen's
// callback) — shutdown() below needs these to stop the interval timers and
// wait for any in-flight tick, so they can't just be fire-and-forgotten.
let reminderScheduler = null;
let pollScheduler = null;

const startServer = async () => {
  await prisma.$connect();
  logger.info('db.connected', {});

  initRealtime(server);

  server.listen(PORT, '0.0.0.0', () => {
    logger.info('server.started', { port: PORT });
    const reminderMs = Number(process.env.REMINDER_CHECK_INTERVAL_MS) || 5 * 60 * 1000;
    const automationMs = Number(process.env.POLL_AUTOMATION_INTERVAL_MS) || 60 * 1000;
    reminderScheduler = startReminderScheduler(reminderMs);
    pollScheduler = startPollAutomation(automationMs);
  });
};

// On redeploy/restart, stop accepting new connections and let in-flight
// requests finish (or time out) before the process exits, instead of
// dropping them mid-response — this is what actually matters at 300-400
// concurrent workers, where a bare `process.exit()` would cut real requests.
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.shutdown_start', { signal });

  // Stop scheduling new poll-automation/reminder ticks the instant shutdown
  // begins — clearInterval happens synchronously inside .stop(), so this
  // doesn't wait on the (possibly slow) HTTP drain below. Each .stop() also
  // returns a promise for whatever tick is currently mid-flight, which is
  // awaited before Prisma disconnects so a running DB write can't be cut off
  // mid-way and no tick is ever left running after shutdown started.
  const schedulersDone = Promise.all([
    reminderScheduler?.stop() ?? Promise.resolve(),
    pollScheduler?.stop() ?? Promise.resolve(),
  ]);

  server.close(async () => {
    await schedulersDone;
    await prisma.$disconnect();
    logger.info('server.shutdown_complete', {});
    process.exit(0);
  });
  // Don't hang forever if a connection never closes (e.g. an open socket).
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Without this catch, a DB-connect failure here (wrong/rotated credentials,
// database not reachable yet at boot) becomes an unhandledRejection — which
// only logs, by design, so future requests during normal operation aren't
// dropped by one stray rejection. At startup that's the wrong tradeoff: the
// process would keep running with no port ever bound, looking "alive" to a
// process manager while serving nothing. Fail loudly and exit instead, so
// systemd/pm2/nodemon's restart policy (and its own alerting) actually kicks
// in, the same way uncaughtException already does.
startServer().catch((err) => {
  logger.error('server.startup_failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
