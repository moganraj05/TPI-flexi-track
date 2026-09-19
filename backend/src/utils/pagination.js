const MAX_LIMIT = 200;

// Parses optional ?page / ?limit into Prisma skip/take.
//
// `defaultLimit` is the cap the endpoint already applied before pagination
// existed (e.g. /hr/polls was always `take: 120`), so a client that sends
// neither param keeps getting exactly what it got before. Endpoints that
// were previously unbounded pass `defaultLimit: null` and stay unbounded
// until a client actually asks for a page — that's what keeps the legacy
// hrfrontend and the mobile app working untouched.
const parsePagination = (query = {}, { defaultLimit = null, maxLimit = MAX_LIMIT } = {}) => {
  const asked = query.page !== undefined || query.limit !== undefined;

  const limitRaw = Number.parseInt(query.limit, 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, maxLimit) : defaultLimit;

  if (!asked && limit === null) {
    return { paginated: false, page: 1, limit: null, skip: undefined, take: undefined };
  }

  const effectiveLimit = limit || 25;
  const pageRaw = Number.parseInt(query.page, 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return {
    paginated: true,
    page,
    limit: effectiveLimit,
    skip: (page - 1) * effectiveLimit,
    take: effectiveLimit,
  };
};

const buildMeta = (pagination, total) => ({
  total,
  page: pagination.paginated ? pagination.page : 1,
  limit: pagination.paginated ? pagination.limit : total,
  pageCount: pagination.paginated ? Math.max(1, Math.ceil(total / pagination.limit)) : 1,
});

module.exports = { parsePagination, buildMeta, MAX_LIMIT };
