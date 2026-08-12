/** Shared route / GPS validation — single source of truth for live tracking */

export const isValidGpsCoord = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180 &&
  !(lat === 0 && lng === 0);

/** Validate GeoJSON-style [lng, lat] route point */
export const isValidRouteCoordinate = (point) => {
  if (!Array.isArray(point) || point.length < 2) return false;
  const lng = Number(point[0]);
  const lat = Number(point[1]);
  return isValidGpsCoord(lat, lng);
};

export const sanitizeRouteCoords = (geometry) => {
  if (!Array.isArray(geometry)) return [];
  return geometry
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => [Number(c[0]), Number(c[1])])
    .filter(([lng, lat]) => isValidGpsCoord(lat, lng));
};

export const haversineKm = (a, b) => {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const chord =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
};

export const getDirectDistanceMeters = (handyman, customer) => {
  if (!handyman || !customer) return Infinity;
  return haversineKm(handyman, customer) * 1000;
};

/** Reject TomTom distance wildly inconsistent with marker direct distance */
export const isRouteConsistentWithPositions = (routeKm, handyman, customer) => {
  if (routeKm == null || !handyman || !customer) return true;
  const directKm = haversineKm(handyman, customer);
  const directM = directKm * 1000;
  if (directM <= 50 && routeKm > 0.05) return false;
  if (directM <= 200 && routeKm > 0.5) return false;
  if (routeKm > 1 && directKm < 0.5 && routeKm > directKm * 5) return false;
  if (routeKm > directKm * 4 + 1) return false;
  return true;
};

/** Reject stale geometry (e.g. 803 pts for 16m apart) — same rules as before refactor */
export const isGeometryConsistent = (geometry, handyman, customer) => {
  const coords = sanitizeRouteCoords(geometry);
  if (coords.length < 2 || !handyman || !customer) return false;

  const routeStart = { latitude: coords[0][1], longitude: coords[0][0] };
  const routeEnd = {
    latitude: coords[coords.length - 1][1],
    longitude: coords[coords.length - 1][0],
  };
  const startDrift = getDirectDistanceMeters(routeStart, handyman);
  const endDrift = getDirectDistanceMeters(routeEnd, customer);
  const markerDirect = getDirectDistanceMeters(handyman, customer);

  if (startDrift > 200 || endDrift > 200) return false;
  if (markerDirect <= 100 && coords.length > 10) return false;
  if (markerDirect <= 500 && coords.length > 100) return false;
  if (markerDirect <= 100 && coords.length <= 10) return true;
  return true;
};

/** Alias used by HandymanOrderDetailsPage */
export const isRouteGeometryValid = isGeometryConsistent;
