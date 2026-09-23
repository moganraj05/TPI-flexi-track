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
  password: password(),
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
  password: password(),
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

const createHrAdminBody = z.object({
  employeeId: requiredString('Employee ID'),
  name: requiredString('Name'),
  email: z.string().trim().email('Invalid email'),
  phone: z.string().trim().optional(),
  password: password(),
  role: z.string(),
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

module.exports = {
  workerLoginBody,
  pushTokenBody,
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
};
