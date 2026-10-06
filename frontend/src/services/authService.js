import api from './api';

export const authService = {
  // Register new user
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  // Login user
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  // Get current user
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Logout
  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  }
};

export const userService = {
  // Get all users
  getAllUsers: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  // Get user profile
  getUserProfile: async (userId) => {
    const response = await api.get(`/users/profile/${userId}`);
    return response.data;
  },

  // Update user profile
  updateProfile: async (userId, profileData) => {
    const response = await api.put(`/users/profile/${userId}`, profileData);
    return response.data;
  }
};

export const attendanceService = {
  // Get today's attendance state
  getStatus: async () => {
    const response = await api.get('/attendance/status');
    return response.data;
  },

  // Check in for today
  checkIn: async () => {
    const response = await api.post('/attendance/check-in');
    return response.data;
  },

  // Check out for today
  checkOut: async () => {
    const response = await api.post('/attendance/check-out');
    return response.data;
  },

  // Mark attendance
  markAttendance: async (attendanceData) => {
    const response = await api.post('/attendance/mark', attendanceData);
    return response.data;
  },

  // Get my attendance logs
  getMyLogs: async (month, year, page, limit) => {
    const response = await api.get('/attendance/my-logs', {
      params: { month, year, page, limit }
    });
    return response.data;
  },

  // Get attendance summary
  getSummary: async (month, year) => {
    const response = await api.get('/attendance/summary', {
      params: { month, year }
    });
    return response.data;
  }
};

export const leaveService = {
  applyLeave: async (leaveData) => {
    const response = await api.post('/leave/apply', leaveData);
    return response.data;
  },

  getMyLeaves: async () => {
    const response = await api.get('/leave/my-leaves');
    return response.data;
  },

  getLeaveBalance: async () => {
    const response = await api.get('/leave/balance');
    return response.data;
  },

  getLeaveTypes: async () => {
    const response = await api.get('/leave/types');
    return response.data;
  },

  getOrganizationRequests: async (params) => {
    const response = await api.get('/leave/requests', { params });
    return response.data;
  },

  updateStatus: async (leaveId, status, rejectionReason) => {
    const response = await api.patch(`/leave/${leaveId}/status`, {
      status,
      ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
    });
    return response.data;
  },

  cancel: async (leaveId) => {
    const response = await api.patch(`/leave/${leaveId}/cancel`);
    return response.data;
  },

  getActiveLeaves: async () => {
    const response = await api.get('/leave/active-leaves');
    return response.data;
  }
};

export const dashboardService = {
  // Get admin dashboard stats
  getAdminStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  // Get employee dashboard
  getMyStats: async () => {
    const response = await api.get('/dashboard/my-stats');
    return response.data;
  }
};
