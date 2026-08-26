import api from '../api/axios';

const AUTH = {
  REGISTER: '/users/register',
  LOGIN: '/users/login',
  GET_ME: '/users/me',
  VERIFY_EMAIL: '/users/verify-email',
  RESEND_OTP: '/users/resend-otp',
  LOGOUT: '/users/logout',
  REFRESH: '/users/refresh',
  FORGOT_PASSWORD: '/users/forgot-password',
  RESET_PASSWORD: '/users/reset-password',
  UPDATE_PROFILE: '/users/me',
  CHANGE_PASSWORD: '/users/change-password',
};

export const authService = {
  register: (data) => api.post(AUTH.REGISTER, data),
  login: (data) => api.post(AUTH.LOGIN, data),
  getMe: () => api.get(AUTH.GET_ME),
  updateProfile: (data) => api.put(AUTH.UPDATE_PROFILE, data),
  changePassword: (data) => api.put(AUTH.CHANGE_PASSWORD, data),
  forgotPassword: (data) => api.post(AUTH.FORGOT_PASSWORD, data),
  resetPassword: (data) => api.post(AUTH.RESET_PASSWORD, data),
  verifyEmail: (data) => api.post(AUTH.VERIFY_EMAIL, data),
  resendOtp: (data) => api.post(AUTH.RESEND_OTP, data),
  logout: (data) => api.post(AUTH.LOGOUT, data),
  refreshToken: (data) => api.post(AUTH.REFRESH, data),
};


export const uploadService = {
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/uploads/image', formData);
  },
  uploadImages: (files) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('images', file));
    return api.post('/uploads/images', formData);
  },
  uploadAudio: (file) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post('/uploads/audio', formData);
  },
  uploadDocument: (file, type = 'national_id') => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('type', type);
    return api.post('/uploads/document', formData);
  },
};

export const handymanService = {
  getNearby: (params) => api.get('/handymen/nearby', { params }),
  getById: (id) => api.get(`/handymen/${id}`),
  updateProfile: (id, data) => api.put(`/handymen/${id}`, data),
  getAnalytics: (id) => api.get(`/handymen/${id}/analytics`),
  toggleAvailability: (id, data) => api.patch(`/handymen/${id}/availability`, data),
  getStatus: () => api.get('/handymen/status'),
  getHandymanStatus: () => api.get('/handymen/status'),
  getHandymanProfile: () => api.get('/handymen/profile'),
  getMonthlyStats: () => api.get('/handymen/monthly-stats'),
  getMyFines: () => api.get('/handymen/fines/my-fines'),
  requestFineSettlement: (data = {}) => api.post('/handymen/fines/request-settlement', data),
};

export const orderService = {
  create: (data) => api.post('/orders/create', data),
  getById: (id) => api.get(`/orders/${id}`),
  getCustomerOrders: (customerId, params) => api.get(`/orders/customer/${customerId}`, { params }),
  getHandymanOrders: (handymanId) => api.get(`/orders/handyman/${handymanId}`),
  getPendingOrders: (handymanId) => api.get(`/orders/handyman/${handymanId}/pending`),
  updateStatus: (id, data) => api.patch(`/orders/${id}/status`, data),
  startOrder: (id, data) => api.post(`/orders/${id}/start`, data),
  confirmPrice: (id, data) => api.patch(`/orders/${id}/confirm-price`, data),
  confirmCashPayment: (id) => api.patch(`/orders/${id}/confirm-payment`),
  selectPaymentMethod: (id, data) => api.patch(`/orders/${id}/select-payment-method`, data),
  markOnTheWay: (id, data = {}) => api.patch(`/orders/${id}/on-the-way`, data),
  updateLiveLocation: (id, data = {}) => api.put(`/orders/${id}/live-location`, data),
  getDepartureWindow: (id, params = {}) => api.get(`/orders/${id}/departure-window`, { params }),
  requestReschedule: (id, data) => api.post(`/orders/${id}/reschedule-request`, data),
  respondReschedule: (id, data) => api.post(`/orders/${id}/reschedule-response`, data),
  dispute: (id, data) => api.patch(`/orders/${id}/dispute`, data),
};

export const penaltyService = {
  createPaymentIntent: () => api.post('/payments/penalty/create-intent'),
  verifyPaymentIntent: (paymentIntentId) => api.post('/payments/penalty/verify-intent', { paymentIntentId }),
};

export const reviewService = {
  create: (data) => api.post('/reviews/addreview', data),
  getByOrder: (orderId) => api.get(`/reviews/order/${orderId}`),
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
  getServiceTypes: () => api.get('/reference/service-types'),
};

export const supportService = {
  getMyConversation: () => api.get('/support/my-conversation'),
  sendUserMessage: (data) => api.post('/support/my-conversation/messages', data),
  getAdminConversations: (params) => api.get('/support/admin/conversations', { params }),
  getAdminConversationMessages: (id) => api.get(`/support/admin/conversations/${id}/messages`),
  sendAdminMessage: (id, data) => api.post(`/support/admin/conversations/${id}/messages`, data),
  getAdminUnreadCount: () => api.get('/support/admin/unread-count'),
};

export const adminService = {
  getStats: () => api.get('/admin/stats'),
  getDashboardChart: () => api.get('/admin/dashboard/chart'),
  getUsers: () => api.get('/admin/users'),
  getUserDetail: (userId) => api.get(`/admin/users/${userId}`),
  getUserDocuments: (userId) => api.get(`/admin/users/${userId}/documents`),
  banUser: (userId, data) => api.patch(`/admin/users/${userId}/ban`, data),
  banUserWithReason: (userId, data) => api.patch(`/admin/users/${userId}/ban-with-reason`, data),
  liftSuspension: (handymanId) => api.patch(`/admin/handymen/${handymanId}/suspend`, { suspended: false }),
  deleteUser: (userId, reason) => api.delete(`/admin/users/${userId}`, { data: { reason } }),
  getPendingVerification: (params) => api.get('/admin/pending-registrations', { params }),
  autoVerify: (handymanId) => api.patch(`/admin/handymen/${handymanId}/auto-verify`),
  approveHandyman: (handymanId, data = {}) => api.patch(`/admin/approve-registration/${handymanId}`, data),
  rejectHandyman: (handymanId, data = {}) => api.patch(`/admin/reject-registration/${handymanId}`, data),
  suspendHandyman: (handymanId, data) => api.patch(`/admin/handymen/${handymanId}/suspend`, data),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
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
  broadcastAnnouncement: (data) => api.post('/admin/broadcast', data),
  getWallets: () => api.get('/admin/wallets'),
  settleWallet: (handymanId) => api.patch(`/admin/wallets/${handymanId}/settle`),
  payoutHandyman: (handymanId, data) => api.post(`/admin/wallets/${handymanId}/payout`, data),
  getPayoutHistory: (handymanId) => api.get(`/admin/wallets/${handymanId}/history`),
  getSettlementRequests: () => api.get('/admin/settlement-requests'),
  confirmSettlementRequest: (id) => api.patch(`/admin/settlement-requests/${id}/confirm`),
  rejectSettlementRequest: (id, data = {}) => api.patch(`/admin/settlement-requests/${id}/reject`, data),
  getFinePayments: () => api.get('/admin/fine-payments'),
};
