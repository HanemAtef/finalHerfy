import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { handymanService } from '../../services/api';

export const getNearbyHandymen = createAsyncThunk(
  'handymen/getNearbyHandymen',
  async (params, { rejectWithValue }) => {
    try {
      const response = await handymanService.getNearby(params);
      return response.data.handymen || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الحرفيين القريبين' });
    }
  }
);

export const getHandymanById = createAsyncThunk(
  'handymen/getHandymanById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await handymanService.getById(id);
      return response.data.handyman || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل بيانات الحرفي' });
    }
  }
);

export const updateHandymanProfile = createAsyncThunk(
  'handymen/updateHandymanProfile',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await handymanService.updateProfile(id, data);
      return response.data.handyman || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحديث الملف الشخصي' });
    }
  }
);

export const getHandymanAnalytics = createAsyncThunk(
  'handymen/getHandymanAnalytics',
  async (id, { rejectWithValue }) => {
    try {
      const response = await handymanService.getAnalytics(id);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الإحصائيات' });
    }
  }
);

export const toggleAvailability = createAsyncThunk(
  'handymen/toggleAvailability',
  async ({ id, isAvailable }, { rejectWithValue }) => {
    try {
      const response = await handymanService.toggleAvailability(id, { isAvailable });
      return response.data.handyman || response.data || { isAvailable };
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحديث حالة التوفر' });
    }
  }
);

const initialState = {
  nearbyHandymen: [],
  selectedHandyman: null,
  analytics: null,
  isAvailable: true,
  isLoading: false,
  error: null,
};

const handymanSlice = createSlice({
  name: 'handymen',
  initialState,
  reducers: {
    clearHandymanError: (state) => {
      state.error = null;
    },
    clearSelectedHandyman: (state) => {
      state.selectedHandyman = null;
    },
    setAvailabilityLocal: (state, action) => {
      state.isAvailable = action.payload;
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
      .addCase(getNearbyHandymen.pending, pending)
      .addCase(getNearbyHandymen.fulfilled, (state, action) => {
        state.isLoading = false;
        state.nearbyHandymen = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(getNearbyHandymen.rejected, rejected)
      .addCase(getHandymanById.pending, pending)
      .addCase(getHandymanById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedHandyman = action.payload;
      })
      .addCase(getHandymanById.rejected, rejected)
      .addCase(updateHandymanProfile.pending, pending)
      .addCase(updateHandymanProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedHandyman = action.payload;
      })
      .addCase(updateHandymanProfile.rejected, rejected)
      .addCase(getHandymanAnalytics.pending, pending)
      .addCase(getHandymanAnalytics.fulfilled, (state, action) => {
        state.isLoading = false;
        state.analytics = action.payload;
      })
      .addCase(getHandymanAnalytics.rejected, rejected)
      .addCase(toggleAvailability.pending, (state) => {
        state.error = null;
      })
      .addCase(toggleAvailability.fulfilled, (state, action) => {
        state.isAvailable = action.payload?.isAvailable ?? state.isAvailable;
      })
      .addCase(toggleAvailability.rejected, (state, action) => {
        state.error = action.payload?.msg || 'فشل تحديث حالة التوفر';
      });
  },
});

export const { clearHandymanError, clearSelectedHandyman, setAvailabilityLocal } =
  handymanSlice.actions;
export default handymanSlice.reducer;
