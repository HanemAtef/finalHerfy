const express = require("express");
const router = express.Router();
const { authMiddleware, allowedToMiddleware } = require("../middlewares/authMiddleware");
const {
  getMyConversation,
  sendUserMessage,
  getAdminConversations,
  getAdminConversationMessages,
  sendAdminMessage,
  getAdminUnreadCount,
} = require("../controllers/supportChatController");

router.use(authMiddleware);

// ========== User / Craftsman endpoints ==========
router.get("/my-conversation", allowedToMiddleware("customer", "handyman", "admin"), getMyConversation);
router.post("/my-conversation/messages", allowedToMiddleware("customer", "handyman", "admin"), sendUserMessage);

// ========== Admin only endpoints ==========
router.get("/admin/conversations", allowedToMiddleware("admin"), getAdminConversations);
router.get("/admin/conversations/:id/messages", allowedToMiddleware("admin"), getAdminConversationMessages);
router.post("/admin/conversations/:id/messages", allowedToMiddleware("admin"), sendAdminMessage);
router.get("/admin/unread-count", allowedToMiddleware("admin"), getAdminUnreadCount);

module.exports = router;
