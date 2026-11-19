import axios from 'axios';

// Same-origin by default: `vite dev` proxies /api to the backend, and a built
// bundle served behind a reverse proxy keeps working. An absolute localhost URL
// used to be the fallback, which baked the developer's machine into dist/.
// Set VITE_API_URL to point the client at a separately hosted API.
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('workzen_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const attemptedLogin = (error.config?.url || '').includes('/auth/login');
    const attemptedLogout = (error.config?.url || '').includes('/auth/logout');

    // A 401 from the login request itself is a wrong password, not an expired
    // session; redirecting here would discard the message the backend returned.
    // A 401 from logout means the session was already revoked or expired, which
    // is the outcome logout was trying to achieve; reloading would preempt the
    // SPA redirect and race the state cleanup in AuthContext.
    if (status === 401 && !attemptedLogin && !attemptedLogout) {
      localStorage.removeItem('workzen_token');
      localStorage.removeItem('workzen_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
