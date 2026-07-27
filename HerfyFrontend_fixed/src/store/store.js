import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import orderReducer from './slices/orderSlice';
import handymanReducer from './slices/handymanSlice';
import notificationReducer from './slices/notificationSlice';
import chatReducer from './slices/chatSlice';
import adminReducer from './slices/adminSlice';
import locationReducer from './slices/locationSlice';

const appReducer = combineReducers({
  auth: authReducer,
  orders: orderReducer,
  handymen: handymanReducer,
  notifications: notificationReducer,
  chat: chatReducer,
  admin: adminReducer,
  location: locationReducer,
});

// On logout, reset EVERY slice back to its initial state (not just auth).
// Without this, a previous user's orders/chat/notifications/admin data can
// stay in memory and briefly leak into the next logged-in user's screens.
const rootReducer = (state, action) => {
  if (action.type === 'auth/logout') {
    state = undefined;
  }
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
});
