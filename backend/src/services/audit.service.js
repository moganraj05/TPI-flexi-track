const prisma = require('../config/prisma');
const logger = require('../utils/logger');

// Audit trail: one append-only row per action that changes data or exposes
// it (see the AuditLog model in prisma/schema.prisma). Every write path in
// the controllers calls recordAudit() after its change has succeeded.
//
// recordAudit never throws. Losing an audit row is logged loudly
// (audit.write_failed), but must not turn an action that already happened
// into an error response that tells the user it failed.

// Every action code the app writes, grouped by category (the part before the
// dot). The HR console's filter and labels are built from this same list
// (GET /api/hr/audit-logs/meta), so the two can't drift apart.
const AUDIT_ACTIONS = {
  'auth.staff_signed_in': 'Signed in to the staff console',
  'auth.staff_sign_in_failed': 'Failed staff sign-in',
  'auth.staff_signed_out': 'Signed out of the staff console',
  'auth.password_changed': 'Changed own password',
  'auth.password_reset': 'Reset password by email code',
  'auth.worker_password_changed': 'Set own password (worker app)',
  'auth.reset_requested': 'Asked for a password reset',
  'auth.reset_request_approved': 'Password reset request approved',
  'auth.reset_request_rejected': 'Password reset request rejected',
  'auth.reset_request_escalated': 'Password reset request moved up',
  'auth.reset_request_expired': 'Password reset request expired',

  'account.registration_submitted': 'Staff registration submitted',
  'account.registration_approved': 'Staff registration approved',
  'account.registration_rejected': 'Staff registration rejected',
  'account.staff_created': 'Staff/admin login created',
  'account.invite_resent': 'Invitation email resent',
  'account.invite_accepted': 'Invitation accepted (password set)',
  'account.staff_updated': 'Staff/admin login updated',
  'account.staff_deactivated': 'Staff/admin login deactivated',
  'account.staff_deleted': 'Staff/admin login deleted',

  'member.created': 'Employee added',
  'member.updated': 'Employee updated',
  'member.deactivated': 'Employee deactivated',
  'member.reactivated': 'Employee reactivated',
  'member.deleted': 'Employee deleted permanently',
  'member.password_reset': 'Temporary password issued',
  'member.password_change_required': 'New password required at next sign-in',
  'member.bulk_imported': 'Employees imported from Excel',

  'plant.created': 'Plant created',
  'plant.updated': 'Plant updated',
  'plant.deactivated': 'Plant deactivated',

  'attendance.marked': 'Attendance marked on behalf of a worker',
  'follow_up.updated': 'Follow-up updated',
  'poll.closed_early': 'Poll closed early',

  'notification.sent': 'Notification sent to workers',

  'export.downloaded': 'Report downloaded',
};

const AUDIT_CATEGORIES = {
  auth: 'Sign-in & passwords',
  account: 'Staff & admin accounts',
  member: 'Workers & incharges',
  plant: 'Plants',
  attendance: 'Attendance',
  follow_up: 'Follow-ups',
  poll: 'Polls',
  notification: 'Notifications',
  export: 'Reports & exports',
};

// Field names that must never be stored with their value.
const SECRET_FIELDS = new Set(['password', 'passwordHash', 'token', 'pushToken']);

const truncate = (value, max) => (value == null ? null : String(value).slice(0, max));

// Role names as people say them, for summaries ("Created HR login").
// Console logins are shown as just two tags, Admin and Staff; the stored roles
// (superadmin / admin / hr) are unchanged.
const ROLE_NAMES = { hr: 'Staff', admin: 'Admin', superadmin: 'Admin', incharge: 'Incharge', supervisor: 'Supervisor', worker: 'Worker' };
const roleName = (role) => ROLE_NAMES[role] || role || '';

// "Manoj Pillai (EMP1042)" — the label used for people throughout the log.
const personLabel = (user) => {
  if (!user) return null;
  const id = user.employeeId || user.email;
  return id ? `${user.name} (${id})` : user.name || null;
};

// Comparable/displayable form of a value for the before -> after list.
const displayValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

// Before -> after for the given fields, keeping only the ones that changed.
// fields: [{ key, label }]. Secret fields are recorded as changed without
// either value. Pass `after` as the merged final state.
function diffChanges(before, after, fields) {
  const changes = [];
  for (const { key, label } of fields) {
    if (SECRET_FIELDS.has(key)) {
      if (after?.[key] !== undefined && after?.[key] !== null && after?.[key] !== '') {
        changes.push({ field: key, label, from: null, to: null, note: 'changed' });
      }
      continue;
    }
    const from = displayValue(before?.[key]);
    const to = displayValue(after?.[key]);
    if (from !== to) changes.push({ field: key, label, from, to });
  }
  return changes;
}

// actor: defaults to the signed-in user on the request; pass an object
// ({ name, role, identifier }) for actions taken while signed out (failed
// sign-in, self-registration, forgot password).
async function recordAudit(req, { action, entityType, entityId, entityLabel, summary, changes, metadata, actor }) {
  try {
    if (!AUDIT_ACTIONS[action]) throw new Error(`Unknown audit action "${action}"`);
    const user = actor === undefined ? req?.user : null;
    const who = actor || {};

    await prisma.auditLog.create({
      data: {
        actorId: user?.id ?? who.id ?? null,
        actorName: truncate(user?.name ?? who.name ?? null, 200),
        actorRole: truncate(user?.role ?? who.role ?? null, 40),
        actorIdentifier: truncate(user?.employeeId || user?.email || who.identifier || null, 200),
        action,
        category: action.split('.')[0],
        entityType: entityType ?? null,
        entityId: entityId != null ? String(entityId) : null,
        entityLabel: truncate(entityLabel, 300),
        summary: truncate(summary || AUDIT_ACTIONS[action], 1000),
        changes: changes && changes.length ? changes : undefined,
        metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
        ipAddress: truncate(req?.ip, 100),
        userAgent: truncate(req?.get?.('user-agent'), 400),
        requestId: truncate(req?.id, 100),
      },
    });
  } catch (error) {
    logger.error('audit.write_failed', { action, entityType, entityId, error: error.message });
  }
}

module.exports = { recordAudit, diffChanges, personLabel, roleName, AUDIT_ACTIONS, AUDIT_CATEGORIES };
