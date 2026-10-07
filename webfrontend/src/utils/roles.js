// Console logins are shown with just two tags: Admin (stored as `admin` or
// `superadmin`) and Staff (stored as `hr`). The stored roles are unchanged;
// this is only what people see.
const ROLE_TAGS = {
  superadmin: 'Admin',
  admin: 'Admin',
  hr: 'Staff',
  incharge: 'Incharge',
  supervisor: 'Supervisor',
  worker: 'Worker',
  system: 'Automatic',
};

export const roleTag = (role) => ROLE_TAGS[role] || role || '—';

// Admin-only areas: Notifications, Audit log, managing logins.
export const ADMIN_ROLES = ['admin', 'superadmin'];
export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

// The roles an admin can give a new or approved login.
export const ASSIGNABLE_ROLES = [
  { value: 'hr', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];
