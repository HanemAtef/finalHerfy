const etaThrottleMap = new Map(); // orderId -> { timestamp, expiresAt }
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for unused entries

// Clean up stale entries periodically (every hour)
setInterval(() => {
  const now = Date.now();
  for (const [orderId, data] of etaThrottleMap.entries()) {
    if (now > data.expiresAt) {
      etaThrottleMap.delete(orderId);
    }
  }
}, 60 * 60 * 1000).unref();

const getThrottle = (orderId) => {
  const data = etaThrottleMap.get(orderId?.toString());
  return data ? data.timestamp : 0;
};

const setThrottle = (orderId, timestamp) => {
  if (!orderId) return;
  etaThrottleMap.set(orderId.toString(), {
    timestamp,
    expiresAt: Date.now() + TTL_MS
  });
};

const cleanupThrottle = (orderId) => {
  if (!orderId) return;
  etaThrottleMap.delete(orderId.toString());
};

module.exports = {
  getThrottle,
  setThrottle,
  cleanupThrottle
};
