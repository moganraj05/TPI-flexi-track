import { client } from './client';

export const login = async (email, password) => {
  const { data } = await client.post('/hr/login', { email, password });
  return data.data; // { token, user }
};

export const getMe = async () => {
  const { data } = await client.get('/hr/me');
  return data.data;
};

export const changePassword = async (currentPassword, newPassword) => {
  const { data } = await client.patch('/hr/me/password', { currentPassword, newPassword });
  return data;
};

export const getDashboard = async () => {
  const { data } = await client.get('/hr/dashboard');
  return data.data;
};

export const getPolls = async ({ status, department, q } = {}) => {
  const { data } = await client.get('/hr/polls', { params: { status, department, q } });
  return data.data;
};

export const getPollDetail = async (pollId) => {
  const { data } = await client.get(`/hr/polls/${pollId}`);
  return data.data;
};

export const markAttendance = async (pollId, workerId, answer) => {
  const { data } = await client.post(`/hr/polls/${pollId}/attendance`, { workerId, answer });
  return data.data;
};

export const getWorkforce = async (active = 'true') => {
  const { data } = await client.get('/hr/workforce', { params: { active } });
  return data.data;
};

export const getEmployee = async (employeeId) => {
  const { data } = await client.get(`/hr/employees/${employeeId}`);
  return data.data;
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

export const getFollowUps = async () => {
  const { data } = await client.get('/hr/follow-ups');
  return data.data;
};

export const updateFollowUp = async ({ workerId, pollId, status, note }) => {
  const { data } = await client.patch('/hr/follow-ups', { workerId, pollId, status, note });
  return data.data;
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

export const downloadManpowerExcel = async (status = 'closed') => {
  const { data } = await client.get('/hr/export/manpower.xlsx', {
    params: { status },
    responseType: 'blob',
  });
  downloadBlob(data, 'FlexiTrack_HR_Manpower_Plan.xlsx');
};
