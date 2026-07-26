import { createSlice } from '@reduxjs/toolkit';

// Single source of truth for the user's current device location.
//
// WHY THIS EXISTS: previously every page called its own `useCurrentLocation()`
// hook instance, and that hook fetched a fresh GPS position (and therefore the
// browser's permission flow) on every single mount. Navigating
// Home -> Handyman profile -> back to Home re-triggered it three times in a
// row. Because this lives in Redux instead of component state, it survives
// navigation between pages and only needs to be fetched:
//   1) once when the app first loads (see AuthInit.jsx), and
//   2) once more right before creating an order (see CreateOrderPage.jsx),
//      to make sure the address used for the job is fresh.
const initialState = {
  latitude: null,
  longitude: null,
  status: 'idle', // idle | loading | granted | denied | error
  errorMessage: null,
  fetchedAt: null,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    locationRequested: (state) => {
      state.status = 'loading';
      state.errorMessage = null;
    },
    locationGranted: (state, action) => {
      state.latitude = action.payload.latitude;
      state.longitude = action.payload.longitude;
      state.status = 'granted';
      state.errorMessage = null;
      state.fetchedAt = Date.now();
    },
    locationDenied: (state, action) => {
      state.status = action.payload?.permanentlyDenied ? 'denied' : 'error';
      state.errorMessage = action.payload?.message || null;
      // Fall back to Cairo so map-dependent screens still render something.
      if (state.latitude === null) {
        state.latitude = 30.0444;
        state.longitude = 31.2357;
      }
    },
  },
});

export const { locationRequested, locationGranted, locationDenied } = locationSlice.actions;

// Thunk-like helper (kept as a plain function, not createAsyncThunk, since
// geolocation uses a callback API rather than a promise-friendly one).
export const fetchCurrentLocation = () => (dispatch) => {
  if (!navigator.geolocation) {
    dispatch(locationDenied({ message: 'المتصفح لا يدعم تحديد الموقع' }));
    return;
  }

  dispatch(locationRequested());
  navigator.geolocation.getCurrentPosition(
    (position) => {
      dispatch(
        locationGranted({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      );
    },
    (err) => {
      // err.code 1 === PERMISSION_DENIED
      dispatch(
        locationDenied({
          message: err.message,
          permanentlyDenied: err.code === 1,
        })
      );
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

export default locationSlice.reducer;
