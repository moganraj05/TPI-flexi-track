import axios from 'axios';
import { apiBaseURL } from '../api/client';

// The worker / incharge app's own API client. Same backend as the HR
// console, but a separate axios instance and a separate token, so the two
// sign-ins on one browser never interfere: a 401 here signs out only the
// worker app, never the HR console (and the other way round).
export const TOKEN_KEY = 'flexitrack_token';
export const USER_KEY = 'flexitrack_user';
// The HR console's token key (src/api/client.js) — read only, to send an HR
// user who opens "/" to their own console instead of the worker login.
export const STAFF_TOKEN_KEY = 'flexitrack_hr_token';

// Storage can throw (private mode, blocked site data) — the app must still
// work for the current page view, just without remembering the session.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const tokenStorage = {
  get: () => readStorage(TOKEN_KEY),
  set: (token) => writeStorage(TOKEN_KEY, token),
  remove: () => writeStorage(TOKEN_KEY, null),
};

export const userStorage = {
  get: () => {
    const raw = readStorage(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set: (user) => writeStorage(USER_KEY, JSON.stringify(user)),
  remove: () => writeStorage(USER_KEY, null),
};

export const hasStaffSession = () => !!readStorage(STAFF_TOKEN_KEY);

// Carries the HTTP status (0 = the server could not be reached at all), so
// screens can tell "wrong password" from "no connection".
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const http = axios.create({ baseURL: apiBaseURL, timeout: 15000 });

http.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status ?? 0;
    // A 401 on the login request itself just means wrong credentials; on
    // any other request it means the session is gone (logged out elsewhere,
    // account deactivated), so the app signs out.
    if (status === 401 && !error.config?.url?.endsWith('/auth/login') && onUnauthorized) {
      onUnauthorized();
    }
    const message =
      error.response?.data?.message ||
      (status === 0
        ? 'Could not reach FlexiTrack. Check your internet / Wi-Fi connection and try again.'
        : 'Something went wrong. Please try again.');
    return Promise.reject(new ApiError(message, status, error.response?.data));
  }
);

const qs = (params) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const s = query.toString();
  return s ? `?${s}` : '';
};

// Every call returns the backend's whole JSON body ({ success, data,
// message, meta }) — several screens use `message`/`meta`, not just `data`.
export const api = {
  login: (employeeId, password) => http.post('/auth/login', { employeeId, password }).then((r) => r.data),
  getMe: () => http.get('/auth/me').then((r) => r.data),
  logout: () => http.post('/auth/logout').then((r) => r.data),

  getShiftCatalog: () => http.get('/shifts').then((r) => r.data),

  // Worker
  getTodayPoll: () => http.get('/employee/polls/today').then((r) => r.data),
  respondToPoll: (pollId, answer) => http.post(`/employee/polls/${pollId}/respond`, { answer }).then((r) => r.data),
  getMyResponses: ({ page, limit } = {}) => http.get(`/employee/responses/mine${qs({ page, limit })}`).then((r) => r.data),

  // Incharge / supervisor
  getTeamWorkers: () => http.get('/incharge/team').then((r) => r.data),
  createTeamWorker: (payload) => http.post('/incharge/team', payload).then((r) => r.data),
  updateTeamWorker: (workerId, payload) => http.patch(`/incharge/team/${workerId}`, payload).then((r) => r.data),
  deleteTeamWorker: (workerId) => http.delete(`/incharge/team/${workerId}`).then((r) => r.data),
  getInchargePolls: ({ page, limit } = {}) => http.get(`/incharge/polls${qs({ page, limit })}`).then((r) => r.data),
  getInchargePollDetail: (pollId) => http.get(`/incharge/polls/${pollId}`).then((r) => r.data),
  closePoll: (pollId) => http.patch(`/incharge/polls/${pollId}/close`).then((r) => r.data),

  // Web Push (browser notifications)
  getPushPublicKey: () => http.get('/push/public-key').then((r) => r.data),
  getPushStatus: () => http.get('/push/status').then((r) => r.data),
  savePushSubscription: (subscription) => http.post('/push/subscription', subscription).then((r) => r.data),
  deletePushSubscription: (endpoint) => http.delete('/push/subscription', { data: { endpoint } }).then((r) => r.data),
  sendTestPush: () => http.post('/push/test').then((r) => r.data),
};
