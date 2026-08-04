// HerfyFrontend_fixed/src/store/slices/authSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authService } from '../../services/api';

// IMPORTANT: the backend's User schema restricts `role` to "customer" | "handyman" —
// admin accounts are flagged with a separate `isAdmin: true` boolean and NOT a
// role value. Every place in this app that branches on `user.role` (routing,
// redirects, sidebar labels) expects 'admin' to show up there too, so we
// normalize it once, right here, whenever the user object enters the store.
// NOTE: this only works once the backend actually includes `isAdmin` in the
// login/register/getMe/updateProfile responses — today it does not, so admin
// login will still misroute until that field is added server-side.


const normalizeUser = (user) => {
  if (!user) return user;
  return { ...user, role: user.isAdmin ? 'admin' : user.role };
};

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authService.login(userData);
      localStorage.setItem('token', response.data.token);
      if (response.data.refreshToken) {
        localStorage.setItem('refreshToken', response.data.refreshToken);
      }
      console.log(response.data);
      return response.data;
      
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تسجيل الدخول' });
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authService.register(userData);
      // Registration no longer logs the user straight in — the backend
      // requires email OTP verification first (needsVerification: true).
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل إنشاء الحساب' });
    }
  }
);

export const verifyEmail = createAsyncThunk(
  'auth/verifyEmail',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.verifyEmail(data);
      localStorage.setItem('token', response.data.token);
      if (response.data.refreshToken) {
        localStorage.setItem('refreshToken', response.data.refreshToken);
      }
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل التحقق من الحساب' });
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await authService.logout({ refreshToken }).catch(() => {});
      }
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      return true;
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      return rejectWithValue(error.response?.data || { msg: 'فشل تسجيل الخروج' });
    }
  }
);

export const resendOtp = createAsyncThunk(
  'auth/resendOtp',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.resendOtp(data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل إرسال رمز التحقق' });
    }
  }
);

export const getMe = createAsyncThunk(
  'auth/getMe',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getMe();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الملف الشخصي' });
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.updateProfile(data);
      return response.data.user;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحديث الملف الشخصي' });
    }
  }
);

export const forgotPassword = createAsyncThunk(
  'auth/forgotPassword',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.forgotPassword(data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل إرسال رمز التحقق' });
    }
  }
);

export const resetPassword = createAsyncThunk(
  'auth/resetPassword',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.resetPassword(data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل إعادة تعيين كلمة المرور' });
    }
  }
);

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.changePassword(data);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تغيير كلمة المرور' });
    }
  }
);

// =====================================================
// ========== NEW: GET HANDYMAN STATUS ==========
// =====================================================
export const getHandymanStatus = createAsyncThunk(
  'auth/getHandymanStatus',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getHandymanStatus();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل جلب حالة الحرفي' });
    }
  }
);

// =====================================================
// ========== NEW: GET HANDYMAN PROFILE ==========
// =====================================================
export const getHandymanProfile = createAsyncThunk(
  'auth/getHandymanProfile',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getHandymanProfile();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل جلب بيانات الحرفي' });
    }
  }
);

const initialState = {
  user: null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,
  pendingVerificationEmail: null,
  // ===== NEW: Handyman registration status =====
  registrationStatus: null, // 'pending' | 'approved' | 'rejected' | null
  handymanData: null, // Full handyman profile data
  handymanStatusNote: null, // Admin note for rejection/approval
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.registrationStatus = null;
      state.handymanData = null;
      state.handymanStatusNote = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    },
    clearError: (state) => {
      state.error = null;
    },
    // ===== NEW: Set registration status manually =====
    setRegistrationStatus: (state, action) => {
      state.registrationStatus = action.payload.status;
      state.handymanStatusNote = action.payload.note || null;
    },
    // ===== NEW: Clear handyman data =====
    clearHandymanData: (state) => {
      state.handymanData = null;
      state.registrationStatus = null;
      state.handymanStatusNote = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ===== LOGIN =====
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = normalizeUser(action.payload.user);
        state.token = action.payload.token;
        state.isAuthenticated = true;
        // Store handyman status if present
        if (action.payload.handymanStatus) {
          state.registrationStatus = action.payload.handymanStatus;
        }
        if (action.payload.user?.registrationStatus) {
          state.registrationStatus = action.payload.user.registrationStatus;
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل تسجيل الدخول';
        state.pendingVerificationEmail = action.payload?.needsVerification
          ? action.payload.email
          : null;
        // Store registration status if rejected/pending
        if (action.payload?.status) {
          state.registrationStatus = action.payload.status;
          state.handymanStatusNote = action.payload?.note || null;
        }
      })

      // ===== REGISTER =====
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.registrationStatus = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.pendingVerificationEmail = action.payload.email;
        // Store registration status for handyman
        if (action.payload.registrationStatus) {
          state.registrationStatus = action.payload.registrationStatus;
        }
        if (action.payload.role === 'handyman') {
          state.registrationStatus = 'pending';
        }
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل إنشاء الحساب';
      })

      // ===== VERIFY EMAIL =====
      .addCase(verifyEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyEmail.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = normalizeUser(action.payload.user);
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.pendingVerificationEmail = null;
        // Store registration status from verification response
        if (action.payload.registrationStatus) {
          state.registrationStatus = action.payload.registrationStatus;
        }
      })
      .addCase(verifyEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل التحقق من الحساب';
      })

      // ===== RESEND OTP =====
      .addCase(resendOtp.pending, (state) => {
        state.error = null;
      })
      .addCase(resendOtp.rejected, (state, action) => {
        state.error = action.payload?.msg || 'فشل إرسال رمز التحقق';
      })

      // ===== LOGOUT =====
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.pendingVerificationEmail = null;
        state.registrationStatus = null;
        state.handymanData = null;
        state.handymanStatusNote = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.registrationStatus = null;
        state.handymanData = null;
        state.handymanStatusNote = null;
      })

      // ===== GET ME =====
      .addCase(getMe.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getMe.fulfilled, (state, action) => {
        state.isLoading = false;
        const data = action.payload;
        state.user = normalizeUser(data.user || data);
        state.isAuthenticated = true;
        // Store handyman data if present
        if (data.handyman) {
          state.handymanData = data.handyman;
          state.registrationStatus = data.handyman.registrationStatus || null;
        }
        if (data.user?.registrationStatus) {
          state.registrationStatus = data.user.registrationStatus;
        }
      })
      .addCase(getMe.rejected, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.registrationStatus = null;
        state.handymanData = null;
        localStorage.removeItem('token');
      })

      // ===== UPDATE PROFILE =====
      .addCase(updateProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = normalizeUser({ ...state.user, ...action.payload });
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل تحديث الملف الشخصي';
      })

      // ===== FORGOT PASSWORD =====
      .addCase(forgotPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(forgotPassword.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(forgotPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل إرسال رمز التحقق';
      })

      // ===== RESET PASSWORD =====
      .addCase(resetPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(resetPassword.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(resetPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل إعادة تعيين كلمة المرور';
      })

      // ===== CHANGE PASSWORD =====
      .addCase(changePassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل تغيير كلمة المرور';
      })

      // ===== GET HANDYMAN STATUS (NEW) =====
      .addCase(getHandymanStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getHandymanStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.registrationStatus = action.payload.status;
        state.handymanStatusNote = action.payload.note || null;
        if (action.payload.data) {
          state.handymanData = action.payload.data;
        }
      })
      .addCase(getHandymanStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل جلب حالة الحرفي';
      })

      // ===== GET HANDYMAN PROFILE (NEW) =====
      .addCase(getHandymanProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getHandymanProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.handymanData = action.payload;
        state.registrationStatus = action.payload.registrationStatus || null;
      })
      .addCase(getHandymanProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل جلب بيانات الحرفي';
      });
  },
});

export const { logout, clearError, setRegistrationStatus, clearHandymanData } = authSlice.actions;

// =====================================================
// ========== SELECTORS ==========
// =====================================================

// Check if user is a handyman
export const selectIsHandyman = (state) => state.auth.user?.role === 'handyman';

// Check if handyman registration is pending
export const selectIsHandymanPending = (state) => 
  state.auth.registrationStatus === 'pending';

// Check if handyman registration is approved
export const selectIsHandymanApproved = (state) => 
  state.auth.registrationStatus === 'approved';

// Check if handyman registration is rejected
export const selectIsHandymanRejected = (state) => 
  state.auth.registrationStatus === 'rejected';

// Get handyman status message
export const selectHandymanStatusMessage = (state) => {
  const status = state.auth.registrationStatus;
  const note = state.auth.handymanStatusNote;
  
  switch (status) {
    case 'pending':
      return 'حسابك في انتظار موافقة الأدمن';
    case 'approved':
      return 'تم الموافقة على حسابك';
    case 'rejected':
      return note ? `تم رفض حسابك: ${note}` : 'تم رفض حسابك';
    default:
      return null;
  }
};

export default authSlice.reducer;