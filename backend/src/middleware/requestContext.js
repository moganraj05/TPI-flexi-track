const crypto = require('node:crypto');
const logger = require('../utils/logger');

// Assigns every request a correlation ID (reusing one an upstream proxy/load
// balancer already set via X-Request-Id, so a single ID survives the whole
// hop chain in production) and runs the rest of the request inside that ID's
// AsyncLocalStorage context — every logger.* call from here on, in this
// request's controllers/services/error handling, picks it up automatically.
function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id']?.toString().slice(0, 100) || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  logger.runWithContext({ requestId }, () => {
    // Registered inside runWithContext (not before it) so the 'finish' event
    // — which fires later, after the response is actually sent — still runs
    // with this request's context attached; AsyncLocalStorage only follows
    // async work started while the context is active.
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      // 4xx is normal client-facing behavior (bad login, closed poll, etc.),
      // not a server problem — only 5xx warrants `error`.
      const level = res.statusCode >= 500 ? 'error' : 'info';
      logger[level]('http.request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip: req.ip,
      });
    });

    next();
  });
}

module.exports = requestContext;
