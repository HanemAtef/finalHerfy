import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { messageService } from '../../services/api';

export const getMessages = createAsyncThunk(
  'chat/getMessages',
  async (orderId, { rejectWithValue }) => {
    try {
      const response = await messageService.getMessages(orderId);
      return { orderId, messages: response.data.messages || response.data || [] };
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل تحميل الرسائل' });
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ orderId, text }, { rejectWithValue }) => {
    try {
      const response = await messageService.sendMessage({ orderId, text });
      return { orderId, message: response.data.message || response.data };
    } catch (error) {
      return rejectWithValue(error.response?.data || { msg: 'فشل إرسال الرسالة' });
    }
  }
);

const initialState = {
  activeOrderId: null,
  messagesByOrder: {},
  typingByOrder: {},
  isLoading: false,
  error: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveOrderId: (state, action) => {
      state.activeOrderId = action.payload;
    },
    receiveMessage: (state, action) => {
      const { orderId, message } = action.payload;
      if (!state.messagesByOrder[orderId]) state.messagesByOrder[orderId] = [];
      state.messagesByOrder[orderId].push(message);
      state.typingByOrder[orderId] = false;
    },
    setTyping: (state, action) => {
      const { orderId, isTyping } = action.payload;
      state.typingByOrder[orderId] = isTyping;
    },
    clearChatError: (state) => {
      state.error = null;
    },
    clearChat: (state, action) => {
      const orderId = action.payload;
      delete state.messagesByOrder[orderId];
      delete state.typingByOrder[orderId];
      if (state.activeOrderId === orderId) state.activeOrderId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getMessages.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getMessages.fulfilled, (state, action) => {
        state.isLoading = false;
        state.messagesByOrder[action.payload.orderId] = action.payload.messages;
      })
      .addCase(getMessages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.msg || 'فشل تحميل الرسائل';
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { orderId, message } = action.payload;
        if (!state.messagesByOrder[orderId]) state.messagesByOrder[orderId] = [];
        state.messagesByOrder[orderId].push(message);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload?.msg || 'فشل إرسال الرسالة';
      });
  },
});

export const { setActiveOrderId, receiveMessage, setTyping, clearChatError, clearChat } =
  chatSlice.actions;
export default chatSlice.reducer;
