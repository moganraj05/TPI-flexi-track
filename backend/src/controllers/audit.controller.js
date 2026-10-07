const prisma = require('../config/prisma');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { AUDIT_ACTIONS, AUDIT_CATEGORIES, recordAudit } = require('../services/audit.service');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_MAX_ROWS = 10000;

// Filters shared by the list and the CSV export:
//   category  one of AUDIT_CATEGORIES      action  one exact action code
//   actorId   one person's actions         entityId one record's history
//   q         free text over who / what / summary
//   from, to  YYYY-MM-DD (server-local calendar days, both inclusive)
function buildWhere(query) {
  const where = {};
  const errors = [];

  if (query.category) {
    if (!AUDIT_CATEGORIES[query.category]) errors.push('Unknown category');
    else where.category = query.category;
  }
  if (query.action) {
    if (!AUDIT_ACTIONS[query.action]) errors.push('Unknown action');
    else where.action = query.action;
  }
  if (query.actorId) where.actorId = String(query.actorId);
  if (query.entityId) where.entityId = String(query.entityId);

  const q = String(query.q || '').trim().slice(0, 100);
  if (q) {
    where.OR = ['summary', 'actorName', 'actorIdentifier', 'entityLabel', 'ipAddress'].map((field) => ({
      [field]: { contains: q, mode: 'insensitive' },
    }));
  }

  if (query.from || query.to) {
    if ((query.from && !DATE_ONLY_RE.test(query.from)) || (query.to && !DATE_ONLY_RE.test(query.to))) {
      errors.push('Dates must be in YYYY-MM-DD format');
    } else {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(`${query.from}T00:00:00`);
      if (query.to) {
        const end = new Date(`${query.to}T00:00:00`);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
      if (query.from && query.to && where.createdAt.gte >= where.createdAt.lt) errors.push('"From" must be on or before "To"');
    }
  }

  return { where, error: errors[0] || null };
}

const formatEntry = (e) => ({
  id: e.id,
  createdAt: e.createdAt,
  action: e.action,
  actionLabel: AUDIT_ACTIONS[e.action] || e.action,
  category: e.category,
  categoryLabel: AUDIT_CATEGORIES[e.category] || e.category,
  actor: e.actorName || e.actorIdentifier
    ? { id: e.actorId, name: e.actorName, role: e.actorRole, identifier: e.actorIdentifier }
    : null,
  entity: { type: e.entityType, id: e.entityId, label: e.entityLabel },
  summary: e.summary,
  changes: e.changes || [],
  metadata: e.metadata || {},
  ipAddress: e.ipAddress,
  userAgent: e.userAgent,
  requestId: e.requestId,
});

// Action codes + labels and categories, so the console's filters and labels
// come from the same list the backend writes with.
exports.getAuditMeta = (req, res) => {
  res.json({
    success: true,
    data: {
      categories: Object.entries(AUDIT_CATEGORIES).map(([value, label]) => ({ value, label })),
      actions: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label, category: value.split('.')[0] })),
    },
  });
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const { where, error } = buildWhere(req.query);
    if (error) return res.status(400).json({ success: false, message: error });

    const pagination = parsePagination(req.query, { defaultLimit: 50 });
    const [total, entries] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    res.json({ success: true, data: entries.map(formatEntry), meta: buildMeta(pagination, total) });
  } catch (error) {
    next(error);
  }
};

// CSV of the current filter (newest first, capped). Downloading the audit
// trail is itself recorded in it.
const csvCell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
};

exports.exportAuditLogs = async (req, res, next) => {
  try {
    const { where, error } = buildWhere(req.query);
    if (error) return res.status(400).json({ success: false, message: error });

    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_MAX_ROWS,
    });

    const header = ['Time', 'Category', 'Action', 'Done by', 'Role', 'Login', 'Record', 'Summary', 'Changes', 'IP address', 'Request ID'];
    const lines = entries.map((e) => {
      const changes = (e.changes || [])
        .map((c) => (c.note === 'changed' ? `${c.label}: changed` : `${c.label}: ${c.from ?? '—'} → ${c.to ?? '—'}`))
        .join('; ');
      return [
        e.createdAt.toISOString(),
        AUDIT_CATEGORIES[e.category] || e.category,
        AUDIT_ACTIONS[e.action] || e.action,
        e.actorName || (e.actorIdentifier ? '' : 'System'),
        e.actorRole,
        e.actorIdentifier,
        e.entityLabel,
        e.summary,
        changes,
        e.ipAddress,
        e.requestId,
      ]
        .map(csvCell)
        .join(',');
    });

    await recordAudit(req, {
      action: 'export.downloaded',
      entityType: 'report',
      entityLabel: 'Audit log',
      summary: `Downloaded the audit log (CSV, ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`,
      metadata: { report: 'audit_log', format: 'csv', rows: entries.length, filters: req.query },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="FlexiTrack_AuditLog_${stamp}.csv"`);
    res.send(`﻿${[header.join(','), ...lines].join('\r\n')}`);
  } catch (error) {
    next(error);
  }
};
