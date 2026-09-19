// Validates req.body/params/query against Zod schemas before a controller
// runs. This is a shape/type gate only — "is this a string, is this a UUID,
// is this present" — not business rules (uniqueness, cross-entity checks,
// exact wording of domain errors). Those stay in the controllers, unchanged,
// as the single source of truth for that messaging. The gate exists so a
// malformed request (wrong type, missing field) fails with a clean 400 here
// instead of an uncaught TypeError (e.g. `.trim()` on a non-string) turning
// into an opaque 500 further down.
const validate = (schemas) => (req, res, next) => {
  for (const key of ['params', 'query', 'body']) {
    const schema = schemas[key];
    if (!schema) continue;

    const result = schema.safeParse(req[key]);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        success: false,
        message: firstIssue?.message || 'Invalid request',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req[key] = result.data;
  }
  next();
};

module.exports = { validate };
