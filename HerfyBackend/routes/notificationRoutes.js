    const express = require('express');
    const router = express.Router();
    const {authMiddleware} = require('../middlewares/authMiddleware');
    const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    deleteNotification,
    } = require("../controllers/notificationController");

// routes reqiure authentication
router.use(authMiddleware);
router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);
router.get("/unread-count", getUnreadCount);    
router.delete("/:id", deleteNotification);
module.exports = router;