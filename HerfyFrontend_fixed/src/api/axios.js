import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use(
  (config) => {
    // The browser must generate the multipart boundary for FormData uploads.
    if (config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
        if (typeof config.headers.delete === 'function') {
          config.headers.delete('Content-Type');
          config.headers.delete('content-type');
        }
      }
    }

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// A short-lived access token (15m) means 401s from expiry are routine, not
// exceptional — so instead of bouncing straight to /login we try one silent
// refresh first and only replay the original request if that succeeds.
// `refreshPromise` makes concurrent 401s share a single refresh call.
let refreshPromise = null;

const doRefresh = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('no refresh token');

  // Plain axios (not the `api` instance) so this call never recurses
  // through the response interceptor below.
  const response = await axios.post(`${BASE_URL}/users/refresh`, { refreshToken });
  const { token, refreshToken: newRefreshToken } = response.data;
  localStorage.setItem('token', token);
  localStorage.setItem('refreshToken', newRefreshToken);
  return token;
};

const goToLogin = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Joi sends an array of messages. Convert it once so every Redux slice
    // can render a useful validation error instead of an array value.
    if (Array.isArray(error.response?.data?.msg)) {
      error.response.data.msg = error.response.data.msg.join(', ');
    }

    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/users/refresh')) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        goToLogin();
        return Promise.reject(error);
      }
    }

    if (error.response?.status === 401) {
      goToLogin();
    }

    return Promise.reject(error);
  }
);

export default api;
