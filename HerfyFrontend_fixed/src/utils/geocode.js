const TOMTOM_API_KEY = import.meta.env.VITE_TOMTOM_API_KEY;

// Small in-memory cache so we don't hit the API again for coordinates we've
// already resolved (rounded to ~11m precision, which is plenty for display).
const cache = new Map();
const cacheKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

/**
 * Turns raw coordinates into a human-readable place name (e.g. "المعادي، القاهرة")
 * using TomTom's reverse geocoding endpoint. Returns null on any failure so
 * callers can decide their own fallback text instead of ever showing "lat, lng"
 * to the user.
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key);

  if (!TOMTOM_API_KEY) return null;

  try {
    const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lng}.json?key=${TOMTOM_API_KEY}&language=ar`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const address = data?.addresses?.[0]?.address;
    if (!address) return null;

    // Prefer "neighbourhood, city" (e.g. "المعادي، القاهرة"); fall back to
    // whatever freeformAddress TomTom gives us.
    const label =
      [address.municipalitySubdivision || address.streetName, address.municipality]
        .filter(Boolean)
        .join('، ') || address.freeformAddress;

    cache.set(key, label);
    return label;
  } catch {
    return null;
  }
}
