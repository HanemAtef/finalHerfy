const axios = require("axios");
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;
// Strip trailing slash — prevents double-slash when appending /routing/1/...
const TOMTOM_API_URL = (process.env.TOMTOM_API_URL || 'https://api.tomtom.com').replace(/\/+$/, '');

console.log('🔑 TOMTOM_API_KEY =', TOMTOM_API_KEY ? 'PRESENT' : 'MISSING');
console.log('🌐 TOMTOM_API_URL =', TOMTOM_API_URL);

/**
 * Calculate route between two points using TomTom Routing API.
 *
 * Returns:
 *   { distance, eta, trafficDelay, arrivalTime, geometry, isFallback }
 *
 * `isFallback = true` means TomTom failed and geometry is a straight line.
 * The caller should NOT treat fallback geometry as a real road route.
 *
 * `distance` and `eta` are null on failure so the caller can decide
 * whether to show them in the UI.
 */
const calculateRoute = async (origin, destination) => {
  console.log('\n========== 📤 TOMTOM REQUEST ==========');
  console.log('  origin (Handyman)      lat =', origin?.lat, ' lng =', origin?.lng);
  console.log('  destination (Customer) lat =', destination?.lat, ' lng =', destination?.lng);

  // ─── API key guard ───────────────────────────────────────────────────────
  if (!TOMTOM_API_KEY) {
    console.error('❌ TOMTOM FAILURE REASON = TOMTOM_API_KEY is MISSING from environment');
    return { distance: null, eta: null, trafficDelay: null, arrivalTime: null, geometry: null, isFallback: true };
  }

  // ─── Input validation ────────────────────────────────────────────────────
  if (
    !origin || !destination ||
    typeof origin.lat !== 'number' || typeof origin.lng !== 'number' ||
    typeof destination.lat !== 'number' || typeof destination.lng !== 'number' ||
    !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) ||
    !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)
  ) {
    console.error('❌ TOMTOM FAILURE REASON = Invalid coordinates passed to calculateRoute');
    console.error('   origin =', origin, ' destination =', destination);
    return { distance: null, eta: null, trafficDelay: null, arrivalTime: null, geometry: null, isFallback: false };
  }

  // ─── Same-location guard ─────────────────────────────────────────────────
  const sameLocation =
    Math.abs(origin.lat - destination.lat) < 0.00001 &&
    Math.abs(origin.lng - destination.lng) < 0.00001;

  if (sameLocation) {
    console.log('✅ [TomTom] Same location detected — returning zero route (arrived)');
    return {
      distance: 0,
      eta: 0,
      trafficDelay: 0,
      arrivalTime: new Date().toISOString(),
      geometry: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
      isFallback: false,
    };
  }

  // ─── TomTom API request ──────────────────────────────────────────────────
  // TomTom routing format: lat,lng:lat,lng (decimal degrees)
  const originStr = `${origin.lat},${origin.lng}`;
  const destinationStr = `${destination.lat},${destination.lng}`;
  // TOMTOM_API_URL already has trailing slash stripped at module load time
  const url = `${TOMTOM_API_URL}/routing/1/calculateRoute/${originStr}:${destinationStr}/json`;

  const safeUrl = url.replace(TOMTOM_API_KEY, '***');
  console.log('  URL (safe) =', safeUrl);
  console.log('  params = { traffic: true, travelMode: car, routeType: fastest }');

  try {
    const response = await axios.get(url, {
      params: {
        key: TOMTOM_API_KEY,
        traffic: true,
        travelMode: 'car',
        routeType: 'fastest',
        // instructionsType omitted — TomTom rejects 'none' with 400 BAD_INPUT
      },
      timeout: 8000,
    });


    console.log('\n========== 📥 TOMTOM RESPONSE ==========');
    console.log('  HTTP status =', response.status);

    const routesCount = response.data?.routes?.length ?? 0;
    console.log('🛣 TOMTOM ROUTES COUNT =', routesCount);

    const route = response.data?.routes?.[0];
    if (!route || !route.summary) {
      console.error('❌ TOMTOM FAILURE REASON = No route in response. Full response:', JSON.stringify(response.data));
      return { distance: null, eta: null, trafficDelay: null, arrivalTime: null, geometry: null, isFallback: false };
    }

    const summary = route.summary;
    const rawPoints = route.legs?.[0]?.points || [];

    // GeoJSON uses [lng, lat] order
    const geometry = rawPoints
      .filter(
        (p) =>
          p &&
          typeof p.latitude === 'number' &&
          typeof p.longitude === 'number' &&
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude)
      )
      .map((p) => [p.longitude, p.latitude]);

    const etaMin = Math.round((summary.travelTimeInSeconds / 60) * 10) / 10;
    const distKm  = Math.round((summary.lengthInMeters / 1000) * 10) / 10;
    console.log('📐 TOMTOM GEOMETRY POINTS =', geometry.length, '(raw points =', rawPoints.length, ')');
    console.log('⏱ TOMTOM ETA =', etaMin, 'min');
    console.log('📏 TOMTOM DISTANCE =', distKm, 'km');

    if (geometry.length < 2) {
      console.warn('❌ TOMTOM FAILURE REASON = geometry < 2 valid points after filtering. Raw points count:', rawPoints.length);
      // Return real distance/eta but no geometry (don't fake a road)
      return {
        distance: Math.round((summary.lengthInMeters / 1000) * 10) / 10,
        eta: Math.round((summary.travelTimeInSeconds / 60) * 10) / 10,
        trafficDelay: Math.round((summary.trafficDelayInSeconds / 60) * 10) / 10,
        arrivalTime: new Date(Date.now() + summary.travelTimeInSeconds * 1000).toISOString(),
        geometry: null,
        isFallback: false,
      };
    }

    return {
      distance: Math.round((summary.lengthInMeters / 1000) * 10) / 10,
      eta: Math.round((summary.travelTimeInSeconds / 60) * 10) / 10,
      trafficDelay: Math.round((summary.trafficDelayInSeconds / 60) * 10) / 10,
      arrivalTime: new Date(Date.now() + summary.travelTimeInSeconds * 1000).toISOString(),
      geometry,
      isFallback: false,
    };
  } catch (error) {
    console.error('\n========== ❌ TOMTOM FAILURE ==========');
    console.error('❌ TOMTOM FAILURE REASON =', error.message);
    if (error.response) {
      console.error('  HTTP status =', error.response.status);
      console.error('  Response body =', JSON.stringify(error.response.data));
    } else if (error.code === 'ECONNABORTED') {
      console.error('  TOMTOM FAILURE REASON = Request timed out (5s)');
    } else {
      console.error('  TOMTOM FAILURE REASON = Network/connection error');
    }

    // Return null distance/eta so client knows there's no real data.
    // geometry: null so no straight-line is rendered as a road route.
    return {
      distance: null,
      eta: null,
      trafficDelay: null,
      arrivalTime: null,
      geometry: null,
      isFallback: true,
    };
  }
};

module.exports = { calculateRoute };