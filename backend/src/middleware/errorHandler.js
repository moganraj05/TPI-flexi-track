const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Always logged in full server-side (requestId comes from the active
  // AsyncLocalStorage context set up in requestContext.js, not from `err`
  // itself); what reaches the client is filtered below so a 500 never leaks
  // a stack trace, a Prisma query, or a raw driver error message to the
  // caller.
  logger.error('http.error', {
    method: req.method,
    path: req.originalUrl,
    name: err.name,
    code: err.code,
    error: err.message,
    stack: err.stack,
  });

  // Included on every error response (safe — it's an opaque ID, not
  // anything about the failure itself) so a worker/incharge/HR report of
  // "it failed" can be matched straight back to this exact log line.
  const fail = (status, message) => res.status(status).json({ success: false, message, requestId: req.id });

  if (err.name === 'PrismaClientValidationError' || err.code === 'P2023') {
    return fail(400, 'Invalid ID format');
  }

  if (err.code === 'P2002') {
    return fail(409, 'Duplicate entry');
  }

  if (err.code === 'P2025') {
    return fail(404, 'Not found');
  }

  if (err.code === 'P2003') {
    return fail(400, 'Related record not found');
  }

  // body-parser (express.json()) errors on a malformed or oversized body.
  if (err.type === 'entity.parse.failed') {
    return fail(400, 'Invalid JSON body');
  }
  if (err.type === 'entity.too.large') {
    return fail(413, 'Request body too large');
  }

  // CORS rejection thrown by the cors() origin callback in index.js.
  if (err.message === 'Not allowed by CORS') {
    return fail(403, 'Origin not allowed');
  }

  const status = err.status || err.statusCode || 500;
  const isUnexpectedServerError = status >= 500;

  // Operational errors (4xx, or anything with an explicit status) keep their
  // real message — that's UI-facing text the frontends rely on. A genuine
  // 500 with no explicit status is unexpected by definition, so in
  // production it gets a generic message instead of whatever a Prisma/
  // driver/runtime error happened to say (connection strings, table names,
  // etc.) — the full detail is already in the server log above, keyed by
  // the same requestId this response carries.
  fail(
    status,
    isUnexpectedServerError && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error'
  );
};

module.exports = errorHandler;
