import axios from 'axios';

export const TOKEN_KEY = 'flexitrack_hr_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const client = axios.create({ baseURL });

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
