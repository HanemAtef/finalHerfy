// jobs/etaRecalculation.js
// Periodically recalculates ETA for active orders where the handyman has a
// known live location but may have stopped sending socket updates (e.g. app
// backgrounded). Runs every ETA_RECALCULATION_INTERVAL_SEC seconds.

const cron = require('node-cron');
const Order = require('../models/Order');
const { calculateRoute } = require('../utils/tomtom');

const startEtaRecalculationJob = (io) => {
  const intervalSec = parseInt(process.env.ETA_RECALCULATION_INTERVAL_SEC) || 60;

  // Convert seconds to a cron expression (minimum 1 minute for node-cron)
  const cronMinutes = Math.max(1, Math.round(intervalSec / 60));
  const cronExpr = `*/${cronMinutes} * * * *`;

  cron.schedule(cronExpr, async () => {
    try {
      // Only orders that are actively being tracked
      const activeOrders = await Order.find({
        status: { $in: ['accepted', 'price_confirmed', 'in-progress'] },
        isHandymanOnTheWay: true,
        'handymanLiveLocation.coordinates': { $ne: [0, 0] },
        'customerLocation.coordinates': { $exists: true },
      }).lean();

      if (!activeOrders.length) return;

      for (const order of activeOrders) {
        try {
          const [hLng, hLat] = order.handymanLiveLocation.coordinates;
          const [cLng, cLat] = order.customerLocation.coordinates;

          // Skip if handyman location hasn't been updated in the last 10 minutes
          // (handyman likely arrived or disconnected long ago)
          const locationAge = Date.now() - new Date(order.handymanLiveLocation.updatedAt).getTime();
          if (locationAge > 10 * 60 * 1000) continue;

          const routeData = await calculateRoute(
            { lat: hLat, lng: hLng },
            { lat: cLat, lng: cLng }
          );

          if (!routeData || routeData.distance === null) continue;

          // Only update if ETA changed by more than 2 minutes to avoid noise
          if (order.eta && Math.abs(routeData.eta - order.eta) <= 2) continue;

          await Order.updateOne({ _id: order._id }, {
            eta: routeData.eta,
            distanceRemaining: routeData.distance,
            trafficDelay: routeData.trafficDelay,
            arrivalTime: routeData.arrivalTime,
          });

          if (io) {
            io.to(order._id.toString()).emit('locationUpdate', {
              lat: hLat,
              lng: hLng,
              distanceRemaining: routeData.distance,
              eta: routeData.eta,
              trafficDelay: routeData.trafficDelay,
              arrivalTime: routeData.arrivalTime,
            });
          }
        } catch (err) {
          console.error(`ETA recalc failed for order ${order._id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('ETA recalculation job error:', err.message);
    }
  });

  console.log(`ETA recalculation job started (every ${cronMinutes} min)`);
};

module.exports = startEtaRecalculationJob;
