import api from '../api/axios';

const AUTH = {
  REGISTER: '/users/register',
  LOGIN: '/users/login',
  GET_ME: '/users/me',
};

export const authService = {
  register: (data) => api.post(AUTH.REGISTER, data),
  login: (data) => api.post(AUTH.LOGIN, data),
  getMe: () => api.get(AUTH.GET_ME),
  updateProfile: (data) => api.put('/users/me', data),
  forgotPassword: (data) => api.post('/users/forgot-password', data),
  resetPassword: (data) => api.post('/users/reset-password', data),
  verifyEmail: (data) => api.post('/users/verify-email', data),
  resendOtp: (data) => api.post('/users/resend-otp', data),
  logout: (data) => api.post('/users/logout', data),
};

export const uploadService = {
  // Uploads a single image (profile photo/avatar) and returns { url }
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // Uploads multiple images (gallery, order photos, review photos) and returns { urls: [] }
  uploadImages: (files) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('images', file));
    return api.post('/uploads/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // Uploads a voice message for chat and returns { url }
  uploadAudio: (file) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post('/uploads/audio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const handymanService = {
  getNearby: (params) => api.get('/handymen/nearby', { params }),
  getById: (id) => api.get(`/handymen/${id}`),
  updateProfile: (id, data) => api.put(`/handymen/${id}`, data),
  getAnalytics: (id) => api.get(`/handymen/${id}/analytics`),
  toggleAvailability: (id, data) => api.patch(`/handymen/${id}/availability`, data),
};

export const orderService = {
  create: (data) => api.post('/orders/create', data),
  getById: (id) => api.get(`/orders/${id}`),
  getCustomerOrders: (customerId, params) =>
    api.get(`/orders/customer/${customerId}`, { params }),
  getHandymanOrders: (handymanId) => api.get(`/orders/handyman/${handymanId}`),
  getPendingOrders: (handymanId) => api.get(`/orders/handyman/${handymanId}/pending`),
  updateStatus: (id, data) => api.patch(`/orders/${id}/status`, data),
  confirmPrice: (id, data) => api.patch(`/orders/${id}/confirm-price`, data),
  confirmPayment: (id) => api.patch(`/orders/${id}/confirm-payment`),
  markOnTheWay: (id) => api.patch(`/orders/${id}/on-the-way`),
  dispute: (id, data) => api.patch(`/orders/${id}/dispute`, data),
};

export const reviewService = {
  create: (data) => api.post('/reviews/addreview', data),
  getHandymanReviews: (handymanId) => api.get(`/reviews/handyman/${handymanId}`),
};

export const notificationService = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
};

export const messageService = {
  getMessages: (orderId) => api.get(`/messages/${orderId}`),
  sendMessage: (data) => api.post('/messages', data),
  deleteMessage: (id) => api.delete(`/messages/${id}`),
  deleteConversation: (orderId) => api.delete(`/messages/conversation/${orderId}`),
};

export const reportService = {
  fileReport: (orderId, data) => api.post(`/orders/${orderId}/report`, data),
  getMyReports: () => api.get('/reports/mine'),
};

export const referenceService = {
  getCities: () => api.get('/reference/cities'),
  getServiceTypes: () => api.get('/reference/service-types'),
};

export const adminService = {
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
  banUser: (userId, data) => api.patch(`/admin/users/${userId}/ban`, data),
  banUserWithReason: (userId, data) => api.patch(`/admin/users/${userId}/ban-with-reason`, data),
  deleteUser: (userId, reason) => api.delete(`/admin/users/${userId}`, { data: { reason } }),
  getPendingVerification: () => api.get('/admin/handymen/pending-verification'),
  autoVerify: (handymanId) => api.patch(`/admin/handymen/${handymanId}/auto-verify`),
  approveHandyman: (handymanId, data) => api.patch(`/admin/handymen/${handymanId}/approve`, data),
  rejectHandyman: (handymanId, data) => api.patch(`/admin/handymen/${handymanId}/reject`, data),
  suspendHandyman: (handymanId, data) => api.patch(`/admin/handymen/${handymanId}/suspend`, data),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getCities: () => api.get('/admin/cities?all=true'),
  createCity: (data) => api.post('/admin/cities', data),
  updateCity: (id, data) => api.patch(`/admin/cities/${id}`, data),
  deleteCity: (id) => api.delete(`/admin/cities/${id}`),
  getServiceTypes: () => api.get('/admin/service-types?all=true'),
  createServiceType: (data) => api.post('/admin/service-types', data),
  updateServiceType: (id, data) => api.patch(`/admin/service-types/${id}`, data),
  deleteServiceType: (id) => api.delete(`/admin/service-types/${id}`),
  getReports: (params) => api.get('/admin/reports', { params }),
  resolveReport: (id, data) => api.patch(`/admin/reports/${id}/resolve`, data),
  getOverviewAnalytics: (days) => api.get('/admin/analytics/overview', { params: { days } }),
  getCraftsmenAnalytics: () => api.get('/admin/analytics/craftsmen'),
  getJobsAnalytics: () => api.get('/admin/analytics/jobs'),
  getReviewsAnalytics: () => api.get('/admin/analytics/reviews'),
  // Authenticated CSV download — a plain <a href> can't carry the
  // Authorization header, so we fetch as a blob and trigger the save
  // ourselves.
  exportCSV: async (type) => {
    const response = await api.get(`/admin/export/${type}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${type}-export.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
