const express = require("express");

const router = express.Router();

const {
  createMessage,
  getMessages,
  deleteMessage,
  deleteConversation,
} = require("../controllers/messageController");

const { authMiddleware } = require("../middlewares/authMiddleware");

router.post("/", authMiddleware, createMessage);

router.get("/:orderId", authMiddleware, getMessages);

router.delete("/conversation/:orderId", authMiddleware, deleteConversation);
router.delete("/:id", authMiddleware, deleteMessage);

module.exports = router;
