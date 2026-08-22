/** Pure helpers for live-tracking — unit-testable, no Socket.IO side effects */

const ARRIVAL_THRESHOLD_METERS = 50;
const ROUTE_CACHE_TOLERANCE_METERS = 75;
const GPS_REPLAY_MAX_AGE_MS = 120000;
const ARRIVAL_MIN_TRACKING_MS = 30000;
const ARRIVAL_MIN_MOVEMENT_METERS = 25;
const ARRIVAL_MIN_UPDATES = 2;

const haversineMeters = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const chord =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
};

const isActiveTrackingOrder = (order) => {
  if (!order) return false;
  if (!['price_confirmed', 'in-progress'].includes(order.status)) return false;
  if (order.status !== 'in-progress' && !order.isHandymanOnTheWay) return false;
  if (order.trackingStatus === 'expired') return false;

  if (order.trackingExpiresAt) {
    const expiresMs = new Date(order.trackingExpiresAt).getTime();
    if (Number.isFinite(expiresMs) && Date.now() >= expiresMs) return false;
  }

  if (order.trackingStatus === 'stopped' && !order.isHandymanOnTheWay) return false;

  return true;
};

const isGpsEntryFresh = (entry, maxAgeMs = GPS_REPLAY_MAX_AGE_MS) =>
  !!entry &&
  Number.isFinite(entry.updatedAt) &&
  Date.now() - entry.updatedAt <= maxAgeMs;

const createTripState = () => ({
  firstHandymanFix: null,
  firstFixAt: null,
  maxDirectMeters: 0,
  handymanUpdateCount: 0,
});

const applyHandymanTripProgress = (state, handyman, customerDest) => {
  const next = { ...state, handymanUpdateCount: state.handymanUpdateCount + 1 };
  if (!next.firstHandymanFix) {
    next.firstHandymanFix = { lat: handyman.lat, lng: handyman.lng };
    next.firstFixAt = Date.now();
  }
  if (customerDest) {
    const direct = haversineMeters(handyman, customerDest);
    next.maxDirectMeters = Math.max(next.maxDirectMeters, direct);
  }
  return next;
};

/**
 * Gate arrival when co-located at trip start.
 * Allows legitimate arrival after en-route evidence, movement, or minimum tracking time.
 */
const shouldAllowArrival = (tripState, handyman, directMeters, now = Date.now()) => {
  if (directMeters > ARRIVAL_THRESHOLD_METERS) return false;

  const elapsed = tripState.firstFixAt ? now - tripState.firstFixAt : 0;
  const movedFromFirst = tripState.firstHandymanFix
    ? haversineMeters(handyman, tripState.firstHandymanFix)
    : 0;

  if (tripState.maxDirectMeters > ARRIVAL_THRESHOLD_METERS) return true;
  if (movedFromFirst >= ARRIVAL_MIN_MOVEMENT_METERS) return true;
  if (elapsed >= ARRIVAL_MIN_TRACKING_MS && tripState.handymanUpdateCount >= ARRIVAL_MIN_UPDATES) {
    return true;
  }
  return false;
};

const shouldInvalidateRouteCache = (cached, newDestination) => {
  if (!cached?.destination || !newDestination) return false;
  if (
    cached.destinationSource &&
    newDestination.source &&
    cached.destinationSource !== newDestination.source
  ) {
    return true;
  }
  return haversineMeters(cached.destination, newDestination) > ROUTE_CACHE_TOLERANCE_METERS;
};

const shouldRecalculateRoute = ({ throttleExpired, cacheStillValid }) =>
  throttleExpired || !cacheStillValid;

const isRouteCacheValid = (trusted, origin, destination, destinationSource) => {
  if (!trusted?.origin || !trusted?.destination) return false;
  if (
    trusted.destinationSource &&
    destinationSource &&
    trusted.destinationSource !== destinationSource
  ) {
    return false;
  }
  const originDrift = haversineMeters(trusted.origin, origin);
  const destDrift = haversineMeters(trusted.destination, destination);
  return (
    originDrift <= ROUTE_CACHE_TOLERANCE_METERS &&
    destDrift <= ROUTE_CACHE_TOLERANCE_METERS
  );
};

module.exports = {
  ARRIVAL_THRESHOLD_METERS,
  ROUTE_CACHE_TOLERANCE_METERS,
  GPS_REPLAY_MAX_AGE_MS,
  ARRIVAL_MIN_TRACKING_MS,
  haversineMeters,
  isActiveTrackingOrder,
  isGpsEntryFresh,
  createTripState,
  applyHandymanTripProgress,
  shouldAllowArrival,
  shouldInvalidateRouteCache,
  shouldRecalculateRoute,
  isRouteCacheValid,
};
