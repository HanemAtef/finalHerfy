const Notification = require('../models/Notification');

const notificationSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(' Notification socket connected:', socket.id);

    // ========== 1. Join User Room ==========

    socket.on('join-user-room', () => {
      const userId = socket.user?._id?.toString();
      if (userId) {
        socket.join(`user_${userId}`);
       // console.log(` User joined notification room: user_${userId}`);
      }
    });

    // ========== 2. Leave User Room ==========
    socket.on('leave-user-room', () => {
      const userId = socket.user?._id?.toString();
      if (userId) {
        socket.leave(`user_${userId}`);
      // console.log(` User left notification room: user_${userId}`);
      }
    });

    // ========== 3. Mark Notification as Read ==========

    socket.on('mark-notification-read', async (notificationId) => {
      try {
        const userId = socket.user?._id?.toString();
        if (!userId) return;

        const notification = await Notification.findOneAndUpdate(
          { _id: notificationId, userId },
          { isRead: true, readAt: new Date() },
          { new: true }
        );
        if (notification) {
          io.to(`user_${notification.userId}`).emit('notification-read', notification);
          // console.log(` Notification marked as read: ${notificationId}`);
        }
      } catch (error) {
        // console.log(' Error marking notification as read:', error);
      }
    });

    // ========== 4. Mark All Notifications as Read ==========

    socket.on('mark-all-notifications-read', async () => {
      try {
        const userId = socket.user?._id?.toString();
        if (!userId) return;

        const result = await Notification.updateMany(
          { userId, isRead: false },
          { isRead: true, readAt: new Date() }
        );
        io.to(`user_${userId}`).emit('all-notifications-read');
        // console.log(` All notifications marked as read for user: ${userId}`);
      } catch (error) {
        // console.log(' Error marking all notifications as read:', error);
      }
    });

    // ========== 5. Get Unread Count ==========
  
    socket.on('get-unread-count', async () => {
      try {
        const userId = socket.user?._id?.toString();
        if (!userId) return;

        const count = await Notification.countDocuments({
          userId,
          isRead: false,
        });
        socket.emit('unread-count', { count });
        // console.log(` Unread count for user ${userId}: ${count}`);
      } catch (error) {
        // console.log(' Error getting unread count:', error);
      }
    });

    // ========== 6. Disconnect ==========
    socket.on('disconnect', () => {
      // console.log(' Notification socket disconnected:', socket.id);
    });
  });
};

module.exports = notificationSocket;