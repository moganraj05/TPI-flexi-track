import { client } from './client';

export const login = async (email, password) => {
  const { data } = await client.post('/hr/login', { email, password });
  return data.data; // { token, user }
};

export const getMe = async () => {
  const { data } = await client.get('/hr/me');
  return data.data;
};

export const logout = async () => {
  const { data } = await client.post('/hr/logout');
  return data;
};

export const changePassword = async (currentPassword, newPassword) => {
  const { data } = await client.patch('/hr/me/password', { currentPassword, newPassword });
  return data;
};

export const getDashboard = async () => {
  const { data } = await client.get('/hr/dashboard');
  return data.data;
};

// Returns { items, meta }. `meta` carries total/page/pageCount for the
// pager plus `shifts` (the distinct shift timings available under the
// current status/plant filter) so the shift dropdown stays complete
// instead of only reflecting the rows on the current page.
export const getPolls = async ({
  status,
  department,
  q,
  shiftStart,
  shiftEnd,
  date,
  fromDate,
  toDate,
  page,
  limit,
  summary,
} = {}) => {
  const { data } = await client.get('/hr/polls', {
    params: { status, department, q, shiftStart, shiftEnd, date, fromDate, toDate, page, limit, summary },
  });
  return { items: data.data, meta: data.meta };
};

export const getPollDetail = async (pollId) => {
  const { data } = await client.get(`/hr/polls/${pollId}`);
  return data.data;
};

// HR recording a Yes/No answer on a worker's behalf (they haven't responded
// themselves). Same upsert the worker's own app uses — if they respond
// afterward, their answer replaces this one, same as if HR had never marked
// it. Works regardless of poll status; the backend doesn't reject a closed
// poll here (autoCloseExpiredPolls already runs ahead of this in
// loadPollOr404, and marking is how a closed poll's stragglers get an
// official answer recorded after the fact).
export const markAttendance = async (pollId, workerId, answer) => {
  const { data } = await client.post(`/hr/polls/${pollId}/attendance`, { workerId, answer });
  return data.data;
};

// Returns { items, meta }. Filtering (role/plant/search) and paging are all
// done in the database — the caller gets one page, not the whole workforce.
export const getWorkforce = async ({ active = 'true', role, department, q, page, limit } = {}) => {
  const { data } = await client.get('/hr/workforce', {
    params: { active, role, department, q, page, limit },
  });
  return { items: data.data, meta: data.meta };
};

// page/limit are optional — omitted, the backend keeps its own existing
// default window (40), so InchargeDetail's call site (which doesn't need
// history pagination) is unaffected. `meta` (the history list's pagination
// info) is merged in alongside employee/directReports/history rather than
// dropped, the way the previous `return data.data` used to.
export const getEmployee = async (employeeId, { page, limit } = {}) => {
  const { data } = await client.get(`/hr/employees/${employeeId}`, { params: { page, limit } });
  return { ...data.data, meta: data.meta };
};

export const getLiveBoard = async () => {
  const { data } = await client.get('/hr/live');
  return data.data;
};

export const getDepartments = async () => {
  const { data } = await client.get('/hr/departments');
  return data.data;
};

export const getDepartment = async (id) => {
  const { data } = await client.get(`/hr/departments/${id}`);
  return data.data;
};

export const createDepartment = async ({ name, code }) => {
  const { data } = await client.post('/hr/departments', { name, code });
  return data.data;
};

export const updateDepartment = async (id, updates) => {
  const { data } = await client.patch(`/hr/departments/${id}`, updates);
  return data.data;
};

export const deactivateDepartment = async (id) => {
  const { data } = await client.delete(`/hr/departments/${id}`);
  return data;
};

export const createTeamMember = async (payload) => {
  const { data } = await client.post('/hr/team', payload);
  return data.data;
};

export const updateTeamMember = async (id, updates) => {
  const { data } = await client.patch(`/hr/team/${id}`, updates);
  return data.data;
};

export const deactivateTeamMember = async (id) => {
  const { data } = await client.delete(`/hr/team/${id}`);
  return data;
};

// Blob download of the fillable bulk-add-workers template — a real example
// row plus read-only "Incharges reference"/"Shift codes" sheets scoped to
// the given plant, via the shared downloadBlob helper below.
export const downloadTeamBulkTemplate = async (department) => {
  const { data } = await client.get('/hr/team/bulk-template.xlsx', {
    params: { department },
    responseType: 'blob',
  });
  downloadBlob(data, 'FlexiTrack_HR_BulkWorkers_Template.xlsx');
};

// Uploads a filled-in bulk-add-workers spreadsheet. Returns { created,
// failed, errors: [{row, employeeId, message}] } — every row is validated
// and inserted independently server-side, so this always resolves (unless
// the request itself fails), never throws for individual bad rows.
export const importTeamBulk = async ({ department, file }) => {
  const formData = new FormData();
  formData.append('department', department);
  formData.append('file', file);
  const { data } = await client.post('/hr/team/bulk-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
};

export const getHrAdmins = async () => {
  const { data } = await client.get('/hr/admins');
  return data.data;
};

export const createHrAdmin = async (payload) => {
  const { data } = await client.post('/hr/admins', payload);
  return data.data;
};

export const updateHrAdmin = async (id, updates) => {
  const { data } = await client.patch(`/hr/admins/${id}`, updates);
  return data.data;
};

export const deactivateHrAdmin = async (id) => {
  const { data } = await client.delete(`/hr/admins/${id}`);
  return data;
};

// Pending self-registrations: approve (optionally choosing the role) or
// reject (deletes the pending account). Admin/superadmin only.
export const approveHrRegistration = async (id, role) => {
  const { data } = await client.post(`/hr/admins/${id}/approve`, { role });
  return data;
};

export const rejectHrRegistration = async (id) => {
  const { data } = await client.post(`/hr/admins/${id}/reject`, {});
  return data;
};

// ---- Public (signed-out) account flows: self-registration & forgot password ----
// Each send returns { expiresInMinutes, resendAfterSeconds }; each verify
// returns { ticket } which the final step must present.

export const getRegistrationPlants = async () => {
  const { data } = await client.get('/hr/register/plants');
  return data.data;
};

export const sendRegisterOtp = async ({ name, employeeId, department, phone, email }) => {
  const { data } = await client.post('/hr/register/send-otp', { name, employeeId, department, phone, email });
  return { message: data.message, ...data.data };
};

export const verifyRegisterOtp = async (email, otp) => {
  const { data } = await client.post('/hr/register/verify-otp', { email, otp });
  return data.data;
};

export const completeRegistration = async ({ ticket, password, confirmPassword }) => {
  const { data } = await client.post('/hr/register/complete', { ticket, password, confirmPassword });
  return data;
};

export const sendResetOtp = async (email) => {
  const { data } = await client.post('/hr/password/forgot', { email });
  return { message: data.message, ...data.data };
};

export const verifyResetOtp = async (email, otp) => {
  const { data } = await client.post('/hr/password/verify-otp', { email, otp });
  return data.data;
};

export const resetPassword = async ({ ticket, password, confirmPassword }) => {
  const { data } = await client.post('/hr/password/reset', { ticket, password, confirmPassword });
  return data;
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const downloadPollExcel = async (pollId, filenameHint = 'poll') => {
  const { data } = await client.get(`/hr/polls/${pollId}/export.xlsx`, { responseType: 'blob' });
  downloadBlob(data, `FlexiTrack_${filenameHint}.xlsx`);
};

export const downloadPollPdf = async (pollId, filenameHint = 'poll') => {
  const { data } = await client.get(`/hr/polls/${pollId}/export.pdf`, { responseType: 'blob' });
  downloadBlob(data, `FlexiTrack_${filenameHint}.pdf`);
};

// fromDate/toDate default to undefined (no filter) rather than requiring
// callers to pass them — this export intentionally stays "every plant"
// regardless of the caller's plant filter, but the date range is the one
// filter it does mirror, so it can't silently disagree with what's on screen.
export const downloadManpowerExcel = async ({ status = 'closed', fromDate, toDate } = {}) => {
  const { data } = await client.get('/hr/export/manpower.xlsx', {
    params: { status, fromDate, toDate },
    responseType: 'blob',
  });
  downloadBlob(data, 'FlexiTrack_HR_Manpower_Plan.xlsx');
};

// One workbook, one tab per catalog shift, for a single plant+date.
export const downloadDailyShiftsExcel = async ({ department, date }) => {
  const { data } = await client.get('/hr/export/daily-shifts.xlsx', {
    params: { department, date },
    responseType: 'blob',
  });
  downloadBlob(data, `FlexiTrack_HR_DailyShifts_${date}.xlsx`);
};

// Sends a free-text notification to workers' phones (demo / announcement).
// target: 'all' | 'plant' (with departmentId) | 'worker' (with employeeId).
// Returns { targetLabel, workers, reachable, devicesSent, devicesFailed }.
export const sendWorkerNotification = async ({ target, departmentId, employeeId, title, message }) => {
  const { data } = await client.post('/hr/notifications/send', { target, departmentId, employeeId, title, message });
  return { message: data.message, ...data.data };
};
