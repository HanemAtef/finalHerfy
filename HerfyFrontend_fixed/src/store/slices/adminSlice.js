import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { adminService } from '../../services/api';

export const getAdminStats = createAsyncThunk(
  'admin/getAdminStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminService.getStats();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الإحصائيات' });
    }
  }
);

export const getAllUsers = createAsyncThunk(
  'admin/getAllUsers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminService.getUsers();
      return response.data.data || response.data.users || response.data || [];
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل المستخدمين' });
    }
  }
);

export const banUser = createAsyncThunk(
  'admin/banUser',
  async ({ userId, isBanned }, { rejectWithValue }) => {
    try {
      await adminService.banUser(userId, { isBanned });
      return { userId, isBanned };
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحديث حالة المستخدم' });
    }
  }
);

export const getPendingVerifications = createAsyncThunk(
  'admin/getPendingVerifications',
  async (_, { rejectWithValue }) => {
    try {
      const response = await adminService.getPendingVerification();
      return response.data.data || response.data || [];
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل طلبات التوثيق' });
    }
  }
);

export const verifyHandyman = createAsyncThunk(
  'admin/verifyHandyman',
  async (handymanId, { rejectWithValue }) => {
    try {
      await adminService.autoVerify(handymanId);
      return handymanId;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل توثيق الحرفي' });
    }
  }
);

const initialState = {
  stats: null,
  users: [],
  pendingVerifications: [],
  isLoading: false,
  error: null,
};

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    clearAdminError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const pending = (state) => {
      state.isLoading = true;
      state.error = null;
    };
    const rejected = (state, action) => {
      state.isLoading = false;
      state.error = action.payload?.msg || 'حدث خطأ';
    };

    builder
      .addCase(getAdminStats.pending, pending)
      .addCase(getAdminStats.fulfilled, (state, action) => {
        state.isLoading = false;
        state.stats = action.payload;
      })
      .addCase(getAdminStats.rejected, rejected)
      .addCase(getAllUsers.pending, pending)
      .addCase(getAllUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.users = action.payload;
      })
      .addCase(getAllUsers.rejected, rejected)
      .addCase(banUser.fulfilled, (state, action) => {
        const { userId, isBanned } = action.payload;
        state.users = state.users.map((u) =>
          u._id === userId ? { ...u, isBanned } : u
        );
      })
      .addCase(banUser.rejected, (state, action) => {
        state.error = action.payload?.msg || 'فشل تحديث حالة المستخدم';
      })
      .addCase(getPendingVerifications.pending, pending)
      .addCase(getPendingVerifications.fulfilled, (state, action) => {
        state.isLoading = false;
        state.pendingVerifications = action.payload;
      })
      .addCase(getPendingVerifications.rejected, rejected)
      .addCase(verifyHandyman.fulfilled, (state, action) => {
        state.pendingVerifications = state.pendingVerifications.filter(
          (p) => p.userId !== action.payload
        );
      })
      .addCase(verifyHandyman.rejected, (state, action) => {
        state.error = action.payload?.msg || 'فشل توثيق الحرفي';
      });
  },
});

export const { clearAdminError } = adminSlice.actions;
export default adminSlice.reducer;
