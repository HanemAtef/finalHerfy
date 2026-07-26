const Order = require('../models/Order');
const Handyman = require('../models/Handyman');

const liveTrackingSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(' New client connected:', socket.id);

    // join order room
    // SECURITY FIX (C6): previously any authenticated socket could join
    // any order's tracking room and receive every locationUpdate broadcast
    // for it — any user could watch another user's live handyman GPS trail.
    socket.on('joinOrderRoom', async (orderId) => {
      const order = await Order.findById(orderId);
      if (!order) return;

      const userId = socket.user?._id?.toString();
      const allowed =
        userId &&
        (order.customerId.toString() === userId || order.handymanId.toString() === userId);
      if (!allowed) return;

      socket.join(orderId);
       // console.log(` Client joined order room: ${orderId}`);
    });

    // leave order room
    socket.on('leaveOrderRoom', (orderId) => {
      socket.leave(orderId);
      //console.log(` Client left order room: ${orderId}`);
    });

    // handle location updates from handyman
    // SECURITY FIX (C6): previously any authenticated socket could overwrite
    // handymanLiveLocation on ANY order — spoofing/polluting the tracking
    // data a real customer sees. Only the order's own assigned handyman
    // (or an admin) may write its live location.
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

      //update handyman's live location in the order document
      order.handymanLiveLocation = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      await order.save();

      // live location update to all clients in the order room except the sender
      socket.broadcast.to(orderId).emit('locationUpdate', { lat, lng });
     // console.log(` Location update for order ${orderId}: ${lat}, ${lng}`);
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