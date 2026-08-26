const SupportConversation = require("../models/SupportConversation");
const SupportMessage = require("../models/SupportMessage");
const User = require("../models/User");
const { createNotification } = require("./notificationController");
const mongoose = require("mongoose");

// ========== 1. Get or Create User's Support Conversation ==========
// GET /api/support/my-conversation
const getMyConversation = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const userRole = req.user.role === "handyman" ? "handyman" : "customer";

    let conversation = await SupportConversation.findOne({ userId });

    if (!conversation) {
      const user = await User.findById(userId);
      conversation = await SupportConversation.create({
        userId,
        userRole,
        userName: user?.name || req.user.name || "مستخدم",
        userEmail: user?.email || req.user.email,
        userPhone: user?.phone || req.user.phone,
        lastMessage: "",
        lastMessageAt: new Date(),
        unreadAdminCount: 0,
        unreadUserCount: 0,
        status: "open",
      });
    } else {
      // Refresh user details if updated
      const user = await User.findById(userId);
      if (user && (conversation.userName !== user.name || conversation.userPhone !== user.phone)) {
        conversation.userName = user.name;
        conversation.userPhone = user.phone;
        await conversation.save();
      }
    }

    // Mark admin messages as seen for this user
    await SupportMessage.updateMany(
      { conversationId: conversation._id, senderRole: "admin", seen: false },
      { $set: { seen: true } }
    );

    if (conversation.unreadUserCount > 0) {
      conversation.unreadUserCount = 0;
      await conversation.save();
    }

    const messages = await SupportMessage.find({
      conversationId: conversation._id,
      deleted: false,
    }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    console.error("Error in getMyConversation:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 2. User Sends Message to Admin ==========
// POST /api/support/my-conversation/messages
const sendUserMessage = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const userRole = req.user.role === "handyman" ? "handyman" : "customer";
    const { text, type = "text", mediaUrl } = req.body;

    if (type === "text" && (!text || !text.trim())) {
      return res.status(400).json({ msg: "نص الرسالة مطلوب" });
    }
    if (type !== "text" && !mediaUrl) {
      return res.status(400).json({ msg: "رابط المرفق مطلوب" });
    }

    let conversation = await SupportConversation.findOne({ userId });
    if (!conversation) {
      const user = await User.findById(userId);
      conversation = await SupportConversation.create({
        userId,
        userRole,
        userName: user?.name || req.user.name || "مستخدم",
        userEmail: user?.email || req.user.email,
        userPhone: user?.phone || req.user.phone,
        lastMessage: "",
        lastMessageAt: new Date(),
        unreadAdminCount: 0,
        unreadUserCount: 0,
        status: "open",
      });
    }

    const messagePreview =
      type === "text"
        ? text.trim()
        : type === "image"
        ? "📷 [صورة]"
        : "🎤 [تسجيل صوتي]";

    const message = await SupportMessage.create({
      conversationId: conversation._id,
      senderId: userId,
      senderName: req.user.name || conversation.userName,
      senderRole: userRole,
      text: type === "text" ? text.trim() : "",
      type,
      mediaUrl: type !== "text" ? mediaUrl : null,
      seen: false,
    });

    conversation.lastMessage = messagePreview;
    conversation.lastMessageAt = new Date();
    conversation.unreadAdminCount = (conversation.unreadAdminCount || 0) + 1;
    conversation.status = "open";
    await conversation.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`support_${conversation._id}`).emit("new_support_message", {
        message,
        conversationId: conversation._id,
      });
      io.to("admin_support_channel").emit("admin_support_update", {
        conversation,
        message,
      });
    }

    res.status(201).json({
      success: true,
      message,
      conversation,
    });
  } catch (error) {
    console.error("Error in sendUserMessage:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 3. Admin Gets All Support Conversations ==========
// GET /api/support/admin/conversations
const getAdminConversations = async (req, res) => {
  try {
    const { role, search, status } = req.query;

    const filter = {};
    if (role && ["customer", "handyman"].includes(role)) {
      filter.userRole = role;
    }
    if (status && ["open", "closed"].includes(status)) {
      filter.status = status;
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ userName: regex }, { userEmail: regex }, { userPhone: regex }];
    }

    const conversations = await SupportConversation.find(filter)
      .populate("userId", "name email phone profileImage role isBanned")
      .sort({ lastMessageAt: -1 });

    const totalUnread = conversations.reduce((acc, curr) => acc + (curr.unreadAdminCount || 0), 0);

    res.status(200).json({
      success: true,
      count: conversations.length,
      totalUnread,
      data: conversations,
    });
  } catch (error) {
    console.error("Error in getAdminConversations:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 4. Admin Gets Messages for a Conversation ==========
// GET /api/support/admin/conversations/:id/messages
const getAdminConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ msg: "Invalid conversation ID" });
    }

    const conversation = await SupportConversation.findById(id).populate(
      "userId",
      "name email phone profileImage role isBanned createdAt"
    );

    if (!conversation) {
      return res.status(404).json({ msg: "Conversation not found" });
    }

    // Mark user messages as seen by admin
    await SupportMessage.updateMany(
      { conversationId: id, senderRole: { $in: ["customer", "handyman"] }, seen: false },
      { $set: { seen: true } }
    );

    if (conversation.unreadAdminCount > 0) {
      conversation.unreadAdminCount = 0;
      await conversation.save();
    }

    const messages = await SupportMessage.find({
      conversationId: id,
      deleted: false,
    }).sort({ createdAt: 1 });

    const io = req.app.get("io");
    if (io) {
      io.to(`support_${id}`).emit("support_messages_seen", { conversationId: id });
    }

    res.status(200).json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    console.error("Error in getAdminConversationMessages:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 5. Admin Sends Reply in a Conversation ==========
// POST /api/support/admin/conversations/:id/messages
const sendAdminMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, type = "text", mediaUrl } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ msg: "Invalid conversation ID" });
    }

    if (type === "text" && (!text || !text.trim())) {
      return res.status(400).json({ msg: "نص الرسالة مطلوب" });
    }
    if (type !== "text" && !mediaUrl) {
      return res.status(400).json({ msg: "رابط المرفق مطلوب" });
    }

    const conversation = await SupportConversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ msg: "Conversation not found" });
    }

    const messagePreview =
      type === "text"
        ? text.trim()
        : type === "image"
        ? "📷 [صورة]"
        : "🎤 [تسجيل صوتي]";

    const message = await SupportMessage.create({
      conversationId: id,
      senderId: req.user._id || req.user.id,
      senderName: req.user.name || "إدارة هرفي",
      senderRole: "admin",
      text: type === "text" ? text.trim() : "",
      type,
      mediaUrl: type !== "text" ? mediaUrl : null,
      seen: false,
    });

    conversation.lastMessage = messagePreview;
    conversation.lastMessageAt = new Date();
    conversation.unreadUserCount = (conversation.unreadUserCount || 0) + 1;
    await conversation.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`support_${id}`).emit("new_support_message", {
        message,
        conversationId: id,
      });
      io.to(`user_${conversation.userId}`).emit("new_support_message", {
        message,
        conversationId: id,
      });
      io.to("admin_support_channel").emit("admin_support_update", {
        conversation,
        message,
      });
    }

    // In-app notification to user
    await createNotification(
      io,
      conversation.userId,
      "system_alert",
      "رد من إدارة هرفي 🔵",
      type === "text" ? text.trim() : "أرسلت لك الإدارة مرفقاً جديداً في المحادثة",
      { conversationId: id }
    );

    res.status(201).json({
      success: true,
      message,
      conversation,
    });
  } catch (error) {
    console.error("Error in sendAdminMessage:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 6. Get Admin Support Unread Count ==========
// GET /api/support/admin/unread-count
const getAdminUnreadCount = async (req, res) => {
  try {
    const aggregateResult = await SupportConversation.aggregate([
      { $group: { _id: null, total: { $sum: "$unreadAdminCount" } } },
    ]);
    const unreadCount = aggregateResult[0]?.total || 0;

    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error("Error in getAdminUnreadCount:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = {
  getMyConversation,
  sendUserMessage,
  getAdminConversations,
  getAdminConversationMessages,
  sendAdminMessage,
  getAdminUnreadCount,
};
