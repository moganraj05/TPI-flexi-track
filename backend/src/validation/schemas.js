// Zod schemas for every write endpoint (POST/PATCH/DELETE) plus the few GET
// routes that take an :id-shaped param. Deliberately shape-level, not
// business-level: required-ness, string/uuid/boolean typing, and shift-time
// format (where the exact message is reproduced so behavior doesn't change).
// Enum-like fields (answer, role, follow-up status) are left as plain
// strings here on purpose — the controllers already validate those with the
// exact user-facing message the frontends expect, and duplicating that in
// two places with two different wordings would just create drift.
const { z } = require('zod');
const { isValidShiftTime } = require('../utils/shift');
const { getShiftCatalog } = require('../config/shiftCatalog');

const uuid = (label) => z.string().uuid(`Invalid ${label || 'ID'}`);
const requiredString = (label) => z.string().trim().min(1, `${label} is required`);
const password = () => z.string().min(6, 'Password must be at least 6 characters');
const shiftTime = () =>
  z.string().refine(isValidShiftTime, 'Shift times must be in HH:mm format (e.g. 08:00)');
const shiftCode = () => z.enum(getShiftCatalog().map((s) => s.code), { message: 'Invalid shift code' });
const optionalUuidOrEmpty = (label) =>
  z.union([uuid(label), z.literal('')]).optional().nullable();

// ---- auth ----
const workerLoginBody = z.object({
  employeeId: requiredString('Employee ID'),
  password: requiredString('Password'),
});

const pushTokenBody = z.object({
  pushToken: z.string().startsWith('ExponentPushToken[', 'Invalid push token format'),
});

// ---- web push ----
// The endpoint is a URL this server will later POST to, so it must belong
// to a real browser push service — otherwise any signed-in user could make
// the server send requests to an address of their choosing.
const PUSH_SERVICE_HOST_SUFFIXES = ['.googleapis.com', '.mozilla.com', '.mozaws.net', '.windows.com', '.push.apple.com'];
const isPushServiceEndpoint = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
};
const pushEndpoint = () =>
  z.string().max(2048).refine(isPushServiceEndpoint, "This browser's push service is not supported");

const webPushSubscriptionBody = z.object({
  endpoint: pushEndpoint(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
});

const webPushEndpointBody = z.object({ endpoint: pushEndpoint() });

// ---- employee ----
const pollIdParam = z.object({ pollId: uuid('poll ID') });

const respondBody = z.object({ answer: z.string() });

// ---- incharge / hr team (shared shape) ----
const workerIdParam = z.object({ workerId: uuid('worker ID') });
const idParam = z.object({ id: uuid() });

const createTeamWorkerBody = z.object({
  employeeId: requiredString('Employee ID'),
  name: requiredString('Name'),
  phone: z.string().trim().optional(),
  // Optional: left out, a random temporary password is generated.
  password: password().optional(),
  shiftCode: shiftCode().optional(),
  shiftStart: shiftTime().optional(),
  shiftEnd: shiftTime().optional(),
});

const updateTeamWorkerBody = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').optional(),
  phone: z.string().trim().optional(),
  password: password().optional(),
  shiftCode: shiftCode().optional(),
  shiftStart: shiftTime().optional(),
  shiftEnd: shiftTime().optional(),
});

// ---- hr ----
const hrLoginBody = z.object({
  email: requiredString('Email'),
  password: requiredString('Password'),
});

const changePasswordBody = z.object({
  currentPassword: requiredString('Current password'),
  newPassword: password(),
});

const markAttendanceBody = z.object({
  workerId: uuid('worker ID'),
  answer: z.string(),
});

const createDepartmentBody = z.object({
  name: requiredString('Name'),
  code: requiredString('Code'),
});

const updateDepartmentBody = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').optional(),
  code: z.string().trim().min(1, 'Code cannot be empty').optional(),
  isActive: z.boolean().optional(),
});

const createTeamMemberBody = z.object({
  employeeId: requiredString('Employee ID'),
  name: requiredString('Name'),
  phone: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Invalid email'), z.literal('')]).optional(),
  // Optional: left out, a random temporary password is generated.
  password: password().optional(),
  role: z.string(),
  department: uuid('plant ID'),
  shiftCode: shiftCode().optional(),
  shiftStart: shiftTime().optional(),
  shiftEnd: shiftTime().optional(),
  shiftName: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  process: z.string().trim().optional(),
  incharge: optionalUuidOrEmpty('incharge ID'),
});

const updateTeamMemberBody = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.string().trim().email('Invalid email'), z.literal('')]).optional().nullable(),
  password: password().optional(),
  department: uuid('plant ID').optional(),
  shiftCode: shiftCode().optional(),
  shiftStart: shiftTime().optional(),
  shiftEnd: shiftTime().optional(),
  shiftName: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  process: z.string().trim().optional(),
  incharge: optionalUuidOrEmpty('incharge ID'),
  isActive: z.boolean().optional(),
});

// No password: the person sets their own from the invitation email.
const createHrAdminBody = z.object({
  employeeId: requiredString('Employee ID'),
  name: requiredString('Name'),
  email: z.string().trim().email('Invalid email'),
  phone: z.string().trim().optional(),
  role: z.enum(['hr', 'admin'], { message: 'Role must be Staff or Admin' }),
});

const updateHrAdminBody = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').optional(),
  phone: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const updateFollowUpBody = z.object({
  workerId: uuid('worker ID'),
  pollId: uuid('poll ID'),
  status: z.string(),
  note: z.string().trim().max(1000, 'Note is too long').optional(),
});

const employeeIdParam = z.object({ employeeId: uuid('employee ID') });

// ---- hr self-registration / forgot password ----
// Stricter than the legacy 6-character rule, for the two public flows only
// (self-registration and email reset); 72 is bcrypt's input limit.
const strongPassword = () =>
  z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain at least one letter and one number');

const emailField = () => z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const otpCode = () => z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
const ticketField = () => z.string().min(1, 'Verification is missing. Please start again.');

const withPasswordConfirmation = (shape) =>
  z.object(shape).refine((b) => b.password === b.confirmPassword, {
    message: 'Password and confirm password do not match',
    path: ['confirmPassword'],
  });

const registerSendOtpBody = z.object({
  name: requiredString('Name').max(100, 'Name is too long'),
  employeeId: requiredString('Employee ID').max(30, 'Employee ID is too long'),
  department: uuid('plant'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number'),
  email: emailField(),
});

const otpVerifyBody = z.object({ email: emailField(), otp: otpCode() });

const passwordWithTicketBody = withPasswordConfirmation({
  ticket: ticketField(),
  password: strongPassword(),
  confirmPassword: z.string(),
});

const forgotPasswordBody = z.object({ email: emailField() });

const approveHrAdminBody = z.object({ role: z.enum(['hr', 'admin'], { message: 'Role must be Staff or Admin' }).optional() });

// Staff invitation link: check it, then set the password with it.
const inviteTokenBody = z.object({ token: ticketField().max(2000) });

// Worker app: set your own password (current one only needed when the
// change isn't being required; the controller checks).
const changeOwnPasswordBody = z
  .object({
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(1, 'Enter a new password').max(72, 'Password must be at most 72 characters'),
    confirmPassword: z.string(),
  })
  .refine((b) => b.newPassword === b.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

// Worker app "Forgot password?" (public).
const forgotWorkerPasswordBody = z.object({
  employeeId: requiredString('Employee ID').pipe(z.string().max(40, 'Employee ID is too long')),
  phoneLast4: z.string().trim().regex(/^\d{4}$/, 'Enter the last 4 digits of your phone number'),
});

const resetRequestIdParam = z.object({ requestId: uuid('request ID') });
const rejectResetRequestBody = z.object({
  reason: z.string().trim().min(1, 'Give a reason').max(200, 'Reason is too long (200 characters max)'),
});

// Admin: require a new password at next sign-in for a plant or everyone.
const requirePasswordChangeBody = z.object({
  scope: z.enum(['plant', 'all'], { message: 'Choose a plant or everyone' }),
  departmentId: uuid('plant').optional(),
});

// Admin bulk action on workers/incharges selected in Workforce.
const bulkTeamBody = z.object({
  action: z.enum(['deactivate', 'reactivate', 'delete', 'require_password_change'], { message: 'Unknown action' }),
  ids: z.array(uuid('employee ID')).min(1, 'Select at least one person').max(500, 'Select at most 500 people at a time'),
});
const acceptInviteBody = withPasswordConfirmation({
  ticket: ticketField().max(2000),
  password: strongPassword(),
  confirmPassword: z.string(),
});

// HR "send a notification" (demo / announcements). Target-specific fields
// are checked in the controller, where the plant/worker lookup happens.
const sendNotificationBody = z.object({
  target: z.enum(['all', 'plant', 'worker'], { message: 'Choose who to send to' }),
  departmentId: z.string().uuid('Choose a plant').optional(),
  employeeId: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1, 'Title is required').max(80, 'Title is too long (80 characters max)'),
  message: z.string().trim().min(1, 'Message is required').max(240, 'Message is too long (240 characters max)'),
});

module.exports = {
  sendNotificationBody,
  workerLoginBody,
  pushTokenBody,
  webPushSubscriptionBody,
  webPushEndpointBody,
  pollIdParam,
  respondBody,
  workerIdParam,
  idParam,
  createTeamWorkerBody,
  updateTeamWorkerBody,
  hrLoginBody,
  changePasswordBody,
  markAttendanceBody,
  createDepartmentBody,
  updateDepartmentBody,
  createTeamMemberBody,
  updateTeamMemberBody,
  createHrAdminBody,
  updateHrAdminBody,
  updateFollowUpBody,
  employeeIdParam,
  registerSendOtpBody,
  otpVerifyBody,
  passwordWithTicketBody,
  forgotPasswordBody,
  approveHrAdminBody,
  inviteTokenBody,
  acceptInviteBody,
  bulkTeamBody,
  changeOwnPasswordBody,
  requirePasswordChangeBody,
  forgotWorkerPasswordBody,
  resetRequestIdParam,
  rejectResetRequestBody,
};
