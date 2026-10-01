import axios from 'axios';

export const TOKEN_KEY = 'flexitrack_hr_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Default to whatever host the browser used to load this page — so opening
// the app via the laptop's LAN IP (e.g. from a phone) automatically talks to
// the backend on that same IP, instead of a hardcoded "localhost" that only
// ever means the device the browser itself is running on. VITE_API_URL can
// still override this for unusual setups (backend on a different host).
const baseURL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000/api`;

export const client = axios.create({ baseURL });

// Socket.IO connects to the server root, not the /api prefix — strip it off
// whichever baseURL was resolved above so both stay in sync automatically.
// A relative VITE_API_URL ("/api", the Docker setup where Nginx serves this
// page and proxies the backend) strips down to "" — socket.io treats that as
// a bare "http://" with no host, so fall back to this page's own origin.
export const socketURL = baseURL.replace(/\/api\/?$/, '') || window.location.origin;

client.interceptors.request.use((config) => {
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
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    const message =
      error.response?.data?.message ||
      (error.code === 'ERR_NETWORK'
        ? 'Could not reach the FlexiTrack server. Check the API is running and reachable.'
        : 'Something went wrong. Please try again.');
    return Promise.reject(new Error(message));
  }
);
