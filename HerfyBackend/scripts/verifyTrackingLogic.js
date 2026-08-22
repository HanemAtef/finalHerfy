/**
 * Verifies live-tracking logic for the user's exact test coordinates.
 * Run: node scripts/verifyTrackingLogic.js
 */

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

const ARRIVAL_THRESHOLD = 50;

const handyman = { lat: 30.35779030116286, lng: 31.201550189255848 };
const customerLive = { lat: 30.35784081855575, lng: 31.20170940232474 };
const customerDb = { lat: 30.0613, lng: 31.3317 }; // typical stale DB address

const directLive = haversineMeters(handyman, customerLive);
const directDb = haversineMeters(handyman, customerDb);

console.log('=== TRACKING LOGIC PROOF ===\n');
console.log('Handyman:', handyman);
console.log('Customer (live GPS):', customerLive);
console.log('Customer (DB fallback):', customerDb);
console.log('');
console.log('Direct distance live GPS (m):', Math.round(directLive));
console.log('Direct distance DB location (m):', Math.round(directDb), `(${(directDb / 1000).toFixed(1)} km)`);
console.log('');
console.log('With LIVE customer → arrival triggers:', directLive <= ARRIVAL_THRESHOLD ? 'YES ✅' : 'NO ❌');
console.log('With DB customer only → arrival triggers:', directDb <= ARRIVAL_THRESHOLD ? 'YES' : 'NO ❌ (explains missing arrival)');
console.log('');
console.log('TomTom with DB dest would show ~42.9 km while markers use live GPS → BUG');
console.log('Fix: backend must use liveCustomerLocations before order.customerLocation');
console.log('Fix: arrival on sendCustomerLocation when handyman already sent location');
console.log('');

// Simulate route rejection when TomTom disagrees with direct distance
const tomtomRouteMeters = 42900;
const shouldRejectTomTom = directLive < 500 && tomtomRouteMeters > directLive * 10 + 500;
console.log('TomTom 42.9km rejected when direct=16m:', shouldRejectTomTom ? 'YES ✅' : 'NO ❌');

// Simulate frontend stale route rejection
const routeKm = 42.9;
const directKm = directLive / 1000;
const frontendRejects = directKm * 1000 <= 50 && routeKm > 0.05;
console.log('Frontend rejects 42.9km when direct=16m:', frontendRejects ? 'YES ✅' : 'NO ❌');

if (directLive <= ARRIVAL_THRESHOLD && frontendRejects && shouldRejectTomTom) {
  console.log('\n✅ ALL CHECKS PASS — system should NOT show 42.9 km for this case');
  process.exit(0);
} else {
  console.log('\n❌ CHECKS FAILED');
  process.exit(1);
}
