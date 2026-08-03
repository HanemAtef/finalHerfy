const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const {calculateRoute} = require('../utils/tomtom');

const etaThrottleMap = new Map(); // orderId -> last calculated timestamp

const liveTrackingSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(' New client connected:', socket.id);


    socket.on('joinOrderRoom', async (orderId) => {
      const order = await Order.findById(orderId);
      if (!order) return;

      const userId = socket.user?._id?.toString();
      const allowed =
        userId &&
        (order.customerId.toString() === userId || order.handymanId.toString() === userId);
      if (!allowed) return;

      socket.join(orderId);
    });

    // leave order room
    socket.on('leaveOrderRoom', (orderId) => {
      socket.leave(orderId);
    });


//sendLocation
    socket.on('sendLocation', async (data) => {
      const { orderId, lat, lng } = data;

      if (!lat || !lng) {
        return socket.emit('error', { msg: 'Invalid location data' });
      }

      const order = await Order.findById(orderId);
      if (!order) return;

      const userId = socket.user?._id?.toString();
      const isAssignedHandyman = userId && order.handymanId.toString() === userId;
      const isAdmin = socket.user?.isAdmin;
      if (!isAssignedHandyman && !isAdmin) {
        return socket.emit('error', { msg: 'Not authorized to update this order\'s location' });
      }

      // calc route and ETA using TomTom API
      let routeData = null;
      if (order.customerLocation && order.customerLocation.coordinates) {
        const [customerLng, customerLat] = order.customerLocation.coordinates;
        
        const now = Date.now();
        const lastCalc = etaThrottleMap.get(orderId) || 0;
        const intervalSec = parseInt(process.env.ETA_RECALCULATION_INTERVAL_SEC) || 60;
        
        if (now - lastCalc > intervalSec * 1000) {
          try {
            routeData = await calculateRoute(
                { lat, lng },
                { lat: customerLat, lng: customerLng }
            );
            etaThrottleMap.set(orderId, now);
            
            // Only update if ETA changed meaningfully (e.g. > 2 mins difference)
            if (routeData && order.eta && Math.abs(routeData.eta - order.eta) <= 2) {
              // Ignore small changes to avoid UI spam
              routeData.eta = order.eta;
            }
          } catch (err) {
            console.log("TomTom recalculation failed, keeping previous ETA:", err.message);
          }
        }
      }

      // update handyman live location 
      order.handymanLiveLocation = {
        type: 'Point',
        coordinates: [lng, lat],
        updatedAt: new Date()
      };

      //save ETA and distance if routeData is valid
      if (routeData && routeData.distance !== null) {
        order.eta = routeData.eta;
        order.distanceRemaining = routeData.distance;
        order.trafficDelay = routeData.trafficDelay;
        order.arrivalTime = routeData.arrivalTime;
      }

      await order.save();

      
      const updateData = {
        lat,
        lng,
        ...(routeData && routeData.distance !== null && {
          distanceRemaining: routeData.distance,
          eta: routeData.eta,
          trafficDelay: routeData.trafficDelay,
          arrivalTime: routeData.arrivalTime
        })
      };
      io.to(orderId).emit('locationUpdate', updateData);


      socket.emit('locationSent', { success: true, data: updateData });

      console.log(`📍 Location update for order ${orderId}: ${lat}, ${lng} | ETA: ${routeData?.eta || 'N/A'} min`);
    });

    //live tracking events
    socket.on('startTracking', (orderId) => {
      io.to(orderId).emit('trackingStarted', {
        msg: ' الحرفي في الطريق!',
      });
      //console.log(` Tracking started for order ${orderId}`);
    });

    //stop tracking event
    socket.on('stopTracking', (orderId) => {
      io.to(orderId).emit('trackingStopped', {
        msg: ' الحرفي وصل!',
      });
      console.log(` Tracking stopped for order ${orderId}`);
    });

    // disconnect event
    socket.on('disconnect', () => {
     // console.log(' Client disconnected:', socket.id);
    });
  });
};

module.exports = liveTrackingSocket;