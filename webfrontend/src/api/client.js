import axios from 'axios';

export const TOKEN_KEY = 'flexitrack_hr_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// The signed-in console user, remembered so the console still opens (with
// its saved data) when the device is offline and the server can't confirm
// the session. Cleared with the token.
export const USER_KEY = 'flexitrack_hr_user';
export const getCachedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
};
export const setCachedUser = (user) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage full / blocked — only offline start-up is affected
  }
};

export const OFFLINE_CHANGE_MESSAGE = "You're offline — this change wasn't saved. Try again when you're back online.";
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// Default to whatever host the browser used to load this page — so opening
// the app via the laptop's LAN IP (e.g. from a phone) automatically talks to
// the backend on that same IP, instead of a hardcoded "localhost" that only
// ever means the device the browser itself is running on. API_URL can
// still override this for unusual setups (backend on a different host).
// Every backend route lives under /api, so a configured value without it
// ("https://x.onrender.com" or "https://x.onrender.com/") gets it appended
// instead of every request going to a non-existent path and failing with 404.
const normalizeApiUrl = (value) => {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
};

const baseURL = normalizeApiUrl(import.meta.env.API_URL) || `http://${window.location.hostname}:5000/api`;

// Shared with the worker/incharge app (src/mobile/api.js), which has its own
// axios instance and token but talks to the same backend.
export const apiBaseURL = baseURL;

export const client = axios.create({ baseURL });

// Socket.IO connects to the server root, not the /api prefix — strip it off
// whichever baseURL was resolved above so both stay in sync automatically.
// A relative API_URL ("/api", the Docker setup where Nginx serves this
// page and proxies the backend) strips down to "" — socket.io treats that as
// a bare "http://" with no host, so fall back to this page's own origin.
export const socketURL = baseURL.replace(/\/api\/?$/, '') || window.location.origin;

client.interceptors.request.use((config) => {
  // Changes need the server: refuse them up front while offline (with a
  // clear message) instead of letting them fail later or apply out of order.
  if (isOffline() && (config.method || 'get').toLowerCase() !== 'get') {
    const error = new Error(OFFLINE_CHANGE_MESSAGE);
    error.offline = true;
    return Promise.reject(error);
  }
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.offline) return Promise.reject(error);
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    const message =
      error.response?.data?.message ||
      (error.code === 'ERR_NETWORK'
        ? isOffline()
          ? "You're offline. Check your internet connection and try again."
          : 'Could not reach the FlexiTrack server. Check your connection and try again.'
        : 'Something went wrong. Please try again.');
    const wrapped = new Error(message);
    // 0 = the server could not be reached at all.
    wrapped.status = error.response?.status ?? 0;
    return Promise.reject(wrapped);
  }
);
