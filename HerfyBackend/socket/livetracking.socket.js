const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const {calculateRoute} = require('../utils/tomtom');

const etaThrottleMap = new Map(); // orderId -> last calculated timestamp

const liveTrackingSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('⚡ [Backend Socket Audit] New client connected:', socket.id);

    socket.on('joinOrderRoom', async (orderId) => {
      console.log(`📥 [Backend Socket Audit] joinOrderRoom received for orderId: ${orderId}`);
      if (!orderId) return;

      const order = await Order.findById(orderId);
      if (!order) {
        console.warn(`⚠️ [Backend Socket Audit] joinOrderRoom order not found: ${orderId}`);
        return;
      }

      const userId = socket.user?._id?.toString();
      const allowed =
        userId &&
        (order.customerId.toString() === userId || order.handymanId.toString() === userId);

      if (!allowed) {
        console.warn(`⚠️ [Backend Socket Audit] joinOrderRoom unauthorized user: ${userId}`);
        return;
      }

      const roomStr = orderId.toString();
      socket.join(roomStr);
      console.log(`✅ [Backend Socket Audit] Socket ${socket.id} (user ${userId}) joined room: ${roomStr}`);
    });

    // leave order room
    socket.on('leaveOrderRoom', (orderId) => {
      if (!orderId) return;
      const roomStr = orderId.toString();
      socket.leave(roomStr);
      console.log(`🚪 [Backend Socket Audit] Socket ${socket.id} left room: ${roomStr}`);
    });

    // sendLocation
    socket.on('sendLocation', async (data) => {
      const { orderId, lat, lng } = data || {};
      const numLat = Number(lat);
      const numLng = Number(lng);

      console.log(`📥 [Backend Socket Audit] sendLocation received for order ${orderId}: lat=${lat}, lng=${lng}`);

      if (!orderId || !Number.isFinite(numLat) || !Number.isFinite(numLng)) {
        console.warn(`❌ [Backend Socket Audit] Rejected invalid location data for order ${orderId}: lat=${lat}, lng=${lng}`);
        return socket.emit('error', { msg: 'Invalid location data. Latitude and longitude must be valid numbers.' });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        console.warn(`❌ [Backend Socket Audit] Order not found: ${orderId}`);
        return socket.emit('error', { msg: 'Order not found' });
      }

      const userId = socket.user?._id?.toString();
      const isAssignedHandyman = userId && order.handymanId.toString() === userId;
      const isAdmin = socket.user?.isAdmin;
      if (!isAssignedHandyman && !isAdmin) {
        console.warn(`❌ [Backend Socket Audit] Unauthorized location update by user ${userId} for order ${orderId}`);
        return socket.emit('error', { msg: 'Not authorized to update this order\'s location' });
      }

      // calc route and ETA using TomTom API
      let routeData = null;
      if (order.customerLocation && Array.isArray(order.customerLocation.coordinates) && order.customerLocation.coordinates.length === 2) {
        const [customerLng, customerLat] = order.customerLocation.coordinates;
        
        if (Number.isFinite(customerLat) && Number.isFinite(customerLng)) {
          const now = Date.now();
          const lastCalc = etaThrottleMap.get(orderId) || 0;
          const intervalSec = parseInt(process.env.ETA_RECALCULATION_INTERVAL_SEC) || 60;
          
          if (now - lastCalc > intervalSec * 1000) {
            console.log(`🗺️ [Backend TomTom Audit] Requesting calculateRoute: origin=(${numLat}, ${numLng}) -> destination=(${customerLat}, ${customerLng})`);
            try {
              routeData = await calculateRoute(
                { lat: numLat, lng: numLng },
                { lat: customerLat, lng: customerLng }
              );
              etaThrottleMap.set(orderId, now);
              
              if (routeData && order.eta && Math.abs(routeData.eta - order.eta) <= 2) {
                routeData.eta = order.eta;
              }
              console.log(`✅ [Backend TomTom Audit] Route response:`, routeData);
            } catch (err) {
              console.log("TomTom recalculation failed, keeping previous ETA:", err.message);
            }
          }
        }
      }

      // update handyman live location (only valid numeric coordinates)
      order.handymanLiveLocation = {
        type: 'Point',
        coordinates: [numLng, numLat],
        updatedAt: new Date()
      };

      // save ETA and distance if routeData is valid
      if (routeData && routeData.distance !== null) {
        order.eta = routeData.eta;
        order.distanceRemaining = routeData.distance;
        order.trafficDelay = routeData.trafficDelay;
        order.arrivalTime = routeData.arrivalTime;
      }

      await order.save();

      const updateData = {
        lat: numLat,
        lng: numLng,
        ...(routeData && routeData.distance !== null && {
          distanceRemaining: routeData.distance,
          eta: routeData.eta,
          trafficDelay: routeData.trafficDelay,
          arrivalTime: routeData.arrivalTime
        })
      };

      // Broadcast immediately to order room
      const roomStr = orderId.toString();
      io.to(roomStr).emit('locationUpdate', updateData);
      socket.emit('locationSent', { success: true, data: updateData });

      console.log(`📡 [Backend Socket Audit] Broadcasted locationUpdate to room ${roomStr}: ${numLat}, ${numLng} | ETA: ${routeData?.eta || 'N/A'} min`);
    });

    //live tracking events
    socket.on('startTracking', (orderId) => {
      if (!orderId) return;
      io.to(orderId.toString()).emit('trackingStarted', {
        msg: ' الحرفي في الطريق!',
      });
      console.log(`📡 [Backend Socket Audit] Tracking started for order ${orderId}`);
    });

    //stop tracking event
    socket.on('stopTracking', (orderId) => {
      if (!orderId) return;
      io.to(orderId.toString()).emit('trackingStopped', {
        msg: ' الحرفي وصل!',
      });
      console.log(`📡 [Backend Socket Audit] Tracking stopped for order ${orderId}`);
    });

    // disconnect event
    socket.on('disconnect', () => {
      console.log('⚡ [Backend Socket Audit] Client disconnected:', socket.id);
    });
  });
};

module.exports = liveTrackingSocket;