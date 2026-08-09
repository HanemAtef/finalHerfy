import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { orderService } from '../../services/api';

export const createOrder = createAsyncThunk(
  'orders/createOrder',
  async (data, { rejectWithValue }) => {
    try {
      const response = await orderService.create(data);
      return response.data.order;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل إنشاء الطلب' });
    }
  }
);

export const getCustomerOrders = createAsyncThunk(
  'orders/getCustomerOrders',
  async (customerId, { rejectWithValue }) => {
    try {
      const response = await orderService.getCustomerOrders(customerId);
      return response.data.data || [];
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الطلبات' });
    }
  }
);

export const getHandymanOrders = createAsyncThunk(
  'orders/getHandymanOrders',
  async (handymanId, { rejectWithValue }) => {
    try {
      const response = await orderService.getHandymanOrders(handymanId);
      return response.data.data || [];
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الطلبات' });
    }
  }
);

export const getPendingOrders = createAsyncThunk(
  'orders/getPendingOrders',
  async (handymanId, { rejectWithValue }) => {
    try {
      const response = await orderService.getPendingOrders(handymanId);
      return response.data.data || [];
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الطلبات' });
    }
  }
);

// `extra` carries any additional fields the transition needs — e.g. a `price`
// when accepting, or a `completionImage` URL when completing (the backend now
// requires proof-of-completion before it will mark an order 'completed').
export const updateOrderStatus = createAsyncThunk(
  'orders/updateOrderStatus',
  async ({ id, status, ...extra }, { rejectWithValue }) => {
    try {
      const response = await orderService.updateStatus(id, { status, ...extra });
      return response.data.order || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحديث الطلب' });
    }
  }
);

export const disputeOrder = createAsyncThunk(
  'orders/disputeOrder',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const response = await orderService.dispute(id, { reason });
      return response.data.order || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تسجيل النزاع' });
    }
  }
);

export const fetchOrderById = createAsyncThunk(
  'orders/fetchOrderById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await orderService.getById(id);
      return response.data.order || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الطلب' });
    }
  }
);

export const confirmOrderPrice = createAsyncThunk(
  'orders/confirmOrderPrice',
  async ({ id, confirmed }, { rejectWithValue }) => {
    try {
      const response = await orderService.confirmPrice(id, { confirmed });
      return response.data.order || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تأكيد السعر' });
    }
  }
);

export const markOrderOnTheWay = createAsyncThunk(
  'orders/markOrderOnTheWay',
  async (id, { rejectWithValue }) => {
    try {
      const response = await orderService.markOnTheWay(id);
      return response.data.order || response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحديث الحالة' });
    }
  }
);

const orderSlice = createSlice({
  name: 'orders',
  initialState: {
    orders: [],
    currentOrder: null,
    isLoading: false,
    error: null,
  },
  reducers: {
    clearOrderError: (state) => {
      state.error = null;
    },
    setCurrentOrder: (state, action) => {
      state.currentOrder = action.payload;
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
      .addCase(createOrder.pending, pending)
      .addCase(createOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload;
        state.orders.unshift(action.payload);
      })
      .addCase(createOrder.rejected, rejected)
      .addCase(getCustomerOrders.pending, pending)
      .addCase(getCustomerOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders = action.payload;
      })
      .addCase(getCustomerOrders.rejected, rejected)
      .addCase(getHandymanOrders.pending, pending)
      .addCase(getHandymanOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders = action.payload;
      })
      .addCase(getHandymanOrders.rejected, rejected)
      .addCase(getPendingOrders.pending, pending)
      .addCase(getPendingOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders = action.payload;
      })
      .addCase(getPendingOrders.rejected, rejected)
      .addCase(updateOrderStatus.pending, pending)
      .addCase(updateOrderStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload;
        state.orders = state.orders.map((o) =>
          o._id === action.payload._id ? action.payload : o
        );
      })
      .addCase(updateOrderStatus.rejected, rejected)
      .addCase(disputeOrder.pending, pending)
      .addCase(disputeOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload;
        state.orders = state.orders.map((o) =>
          o._id === action.payload._id ? action.payload : o
        );
      })
      .addCase(disputeOrder.rejected, rejected)
      .addCase(fetchOrderById.pending, pending)
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload.order || action.payload;
      })
      .addCase(fetchOrderById.rejected, rejected)
      .addCase(confirmOrderPrice.pending, pending)
      .addCase(confirmOrderPrice.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload;
        state.orders = state.orders.map((o) =>
          o._id === action.payload._id ? action.payload : o
        );
      })
      .addCase(confirmOrderPrice.rejected, rejected)
      .addCase(markOrderOnTheWay.pending, pending)
      .addCase(markOrderOnTheWay.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentOrder = action.payload;
        state.orders = state.orders.map((o) =>
          o._id === action.payload._id ? action.payload : o
        );
      })
      .addCase(markOrderOnTheWay.rejected, rejected);
  },
});

export const { clearOrderError, setCurrentOrder } = orderSlice.actions;
export default orderSlice.reducer;
