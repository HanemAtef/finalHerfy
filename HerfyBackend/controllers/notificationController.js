    const Notification = require("../models/Notification");

    // ========== 1. Get All Notifications for Current User ==========
    const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        const unreadCount = await Notification.countDocuments({
        userId: req.user.id,
        isRead: false,
        });

        const total = await Notification.countDocuments({ userId: req.user.id });

        res.status(200).json({
        data: notifications,
        unreadCount,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
        },
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 2. Mark Notification as Read ==========
    const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findOne({
        _id: id,
        userId: req.user.id,
        });

        if (!notification) {
        return res.status(404).json({ msg: "Notification not found" });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        res.status(200).json({
        msg: "Notification marked as read",
        notification,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 3. Mark All Notifications as Read ==========
    const markAllAsRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
        { userId: req.user.id, isRead: false },
        { isRead: true, readAt: new Date() }
        );

        res.status(200).json({
        msg: "All notifications marked as read",
        updatedCount: result.modifiedCount,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 4. Get Unread Count ==========
    const getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
        userId: req.user.id,
        isRead: false,
        });

        res.status(200).json({ unreadCount: count });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 5. Delete Notification ==========
    const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findOneAndDelete({
        _id: id,
        userId: req.user.id,
        });

        if (!notification) {
        return res.status(404).json({ msg: "Notification not found" });
        }

        res.status(200).json({ msg: "Notification deleted successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ msg: "Server error", error: error.message });
    }
    };

    // ========== 6. Create Notification ==========
    const createNotification = async (io, userId, type, title, body, data = {}) => {
    try {
        const notification = await Notification.create({
        userId,
        type,
        title,
        body,
        data,
        });

        // Emit the new notification to the user
        if (io) {
        io.to(`user_${userId}`).emit('new-notification', notification);
        }

        return notification;
    } catch (error) {
        console.log(' Error creating notification:', error);
        return null;
    }
    };

    module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    deleteNotification,
    createNotification,
    };