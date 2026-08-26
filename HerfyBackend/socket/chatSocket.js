const Message = require("../models/Message");
const Order = require("../models/Order");
const SupportConversation = require("../models/SupportConversation");
const SupportMessage = require("../models/SupportMessage");
const mongoose = require("mongoose");
const { createNotification } = require("../controllers/notificationController");

const OPEN_STATUSES = ["pending", "accepted", "price_confirmed", "in-progress", "arrived"];

const isValidId = (id) => typeof id === "string" && mongoose.isValidObjectId(id);

const canAccessOrder = (order, userId) =>
  order.customerId?.toString() === userId ||
  order.handymanId?.toString() === userId;

const registerChatSocket = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.user?._id?.toString();
    if (userId) {
      socket.join(`user_${userId}`);
      if (socket.user.isAdmin || socket.user.role === "admin") {
        socket.join("admin_support_channel");
      }
    }

    // ========== ORDER CHAT ==========
    socket.on("joinRoom", async (orderId, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      try {
        if (!isValidId(orderId)) return reply({ ok: false, error: "Invalid order id" });

        const order = await Order.findById(orderId);
        if (!order || !canAccessOrder(order, socket.user._id.toString())) {
          return reply({ ok: false, error: "Not allowed to join this chat" });
        }

        await socket.join(orderId);
        reply({ ok: true });
      } catch (err) {
        console.error("Chat room join failed:", err.message);
        reply({ ok: false, error: "Unable to join chat" });
      }
    });

    socket.on("sendMessage", async (payload = {}) => {
      try {
        const { orderId, text, type = "text", mediaUrl } = payload;
        if (!isValidId(orderId) || !["text", "image", "audio"].includes(type)) return;

        const order = await Order.findById(orderId);
        if (!order) return;

        const currentUserId = socket.user._id.toString();
        if (!canAccessOrder(order, currentUserId)) return;
        if (!OPEN_STATUSES.includes(order.status)) return;
        if (type === "text" && (!text || typeof text !== "string")) return;
        if (type !== "text" && !mediaUrl) return;

        const message = await Message.create({
          orderId,
          sender: socket.user._id,
          type,
          text: type === "text" ? text : "",
          mediaUrl: type !== "text" ? mediaUrl : undefined,
        });

        const newMessage = await Message.findById(message._id).populate("sender", "name profileImage role");

        const recipientRooms = [
          `user_${order.customerId.toString()}`,
          `user_${order.handymanId.toString()}`,
        ];
        io.to(recipientRooms).emit("receiveMessage", newMessage);

        const recipientId =
          order.customerId.toString() === currentUserId
            ? order.handymanId
            : order.customerId;
        await createNotification(
          io,
          recipientId,
          "new_message",
          "New message",
          type === "text" ? text.trim() : "Sent you an attachment",
          { orderId: order._id, messageId: message._id }
        );
      } catch (err) {
        console.error("Chat message send failed:", err.message);
      }
    });

    socket.on("deleteMessage", async (messageId) => {
      try {
        if (!isValidId(messageId)) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        if (message.sender.toString() !== socket.user._id.toString()) return;

        message.deleted = true;
        message.text = "";
        message.mediaUrl = null;
        await message.save();

        io.to(message.orderId.toString()).emit("messageDeleted", { _id: message._id, orderId: message.orderId });
      } catch (err) {
        console.error("Chat message deletion failed:", err.message);
      }
    });

    socket.on("typing", (data) => {
      const orderId = typeof data === "string" ? data : data?.orderId;
      if (orderId) socket.to(orderId).emit("typing");
    });

    // ========== SUPPORT CHAT (ADMIN <-> USER / CRAFTSMAN) ==========
    socket.on("joinSupportRoom", async (conversationId, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      try {
        if (!isValidId(conversationId)) return reply({ ok: false, error: "Invalid conversation id" });

        const conversation = await SupportConversation.findById(conversationId);
        if (!conversation) {
          return reply({ ok: false, error: "Conversation not found" });
        }

        const isOwner = conversation.userId?.toString() === socket.user._id.toString();
        const isAdmin = socket.user.isAdmin || socket.user.role === "admin";

        if (!isOwner && !isAdmin) {
          return reply({ ok: false, error: "Not allowed to join this support chat" });
        }

        await socket.join(`support_${conversationId}`);
        reply({ ok: true });
      } catch (err) {
        console.error("Support room join failed:", err.message);
        reply({ ok: false, error: "Unable to join support chat" });
      }
    });

    socket.on("leaveSupportRoom", (conversationId) => {
      if (conversationId) {
        socket.leave(`support_${conversationId}`);
      }
    });

    socket.on("typingSupport", (data) => {
      const convId = typeof data === "string" ? data : data?.conversationId;
      if (convId) {
        socket.to(`support_${convId}`).emit("typing_support", {
          conversationId: convId,
          user: socket.user.name,
          role: socket.user.role,
        });
      }
    });

    socket.on("disconnect", () => {});
  });
};

module.exports = registerChatSocket;
