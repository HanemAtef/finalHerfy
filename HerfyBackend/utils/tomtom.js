const axios = require("axios")
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY
const TOMTOM_API_URL = process.env.TOMTOM_API_URL || 'https://api.tomtom.com';

// caclculate route between two points using TomTom API
const calculateRoute = async (origin, destination) => {
  try {
    if (
      !origin || !destination ||
      typeof origin.lat !== 'number' || typeof origin.lng !== 'number' ||
      typeof destination.lat !== 'number' || typeof destination.lng !== 'number' ||
      !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) ||
      !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)
    ) {
      console.log('⚠️ TomTom calculateRoute called with invalid coordinates:', { origin, destination });
      return { distance: null, eta: null, trafficDelay: null, arrivalTime: null };
    }

    console.log("🚀 calculateRoute called");
console.log(origin);
console.log(destination);

    const originStr = `${origin.lat},${origin.lng}`;
    const destinationStr = `${destination.lat},${destination.lng}`;

    const sameLocation =
  Math.abs(origin.lat - destination.lat) < 0.00001 &&
  Math.abs(origin.lng - destination.lng) < 0.00001;

if (sameLocation) {
  return {
    distance: 0,
    eta: 0,
    trafficDelay: 0,
    arrivalTime: new Date().toISOString(),
    geometry: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
  };
}
    const url = `${TOMTOM_API_URL}/routing/1/calculateRoute/${originStr}:${destinationStr}/json`;
console.log(url);

console.log({
  key: TOMTOM_API_KEY,
  traffic: true,
  travelMode: "car",
  routeType: "fastest",
  instructionsType: "none",
});
    const response = await axios.get(url, {
      params: {
        key: TOMTOM_API_KEY,
        traffic: true,
        travelMode: 'car',
        routeType: 'fastest',
        instructionsType: 'none'
      },
      timeout: 5000
    });

    const route = response.data?.routes?.[0];
    if (!route || !route.summary) {
      return { distance: null, eta: null, trafficDelay: null, arrivalTime: null };
    }

    const summary = route.summary;
    const rawPoints = route.legs?.[0]?.points || [];
    const geometry = rawPoints
      .filter((p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => [p.longitude, p.latitude]);


    return {
      distance: Math.round((summary.lengthInMeters / 1000) * 10) / 10,
      eta: Math.round((summary.travelTimeInSeconds / 60) * 10) / 10,
      trafficDelay: Math.round((summary.trafficDelayInSeconds / 60) * 10) / 10,
      arrivalTime: new Date(Date.now() + summary.travelTimeInSeconds * 1000).toISOString(),
      geometry: geometry.length >= 2 ? geometry : [[origin.lng, origin.lat], [destination.lng, destination.lat]],
    };
  } catch (error) {
    console.error('TomTom API error:', error.message);
    return {
      distance: null,
      eta: null,
      trafficDelay: null,
      arrivalTime: null,
      geometry: [[origin.lng, origin.lat], [destination.lng, destination.lat]],
    };
  }
}

module.exports = { calculateRoute };