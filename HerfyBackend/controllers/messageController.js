const Message = require("../models/Message");
const Order = require("../models/Order");

const OPEN_STATUSES = ["pending", "accepted", "price_confirmed", "in-progress"];

const createMessage = async (req, res) => {
  try {
    const { orderId, text, type = "text", mediaUrl } = req.body;

    if (!orderId || (type === "text" && !text) || (type !== "text" && !mediaUrl)) {
      return res.status(400).json({
        message: "orderId and (text or mediaUrl depending on type) are required",
      });
    }

    // Check Order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Check User Permission
    const userId = req.user._id.toString();

    const isCustomer = order.customerId.toString() === userId;
    const isHandyman = order.handymanId.toString() === userId;

    if (!isCustomer && !isHandyman) {
      return res.status(403).json({
        message: "You are not allowed to send messages in this order",
      });
    }

    if (!OPEN_STATUSES.includes(order.status)) {
      return res.status(400).json({
        message: "Chat is closed for this order",
      });
    }

    const message = await Message.create({
      orderId,
      sender: req.user._id,
      type,
      text: type === "text" ? text.trim() : "",
      mediaUrl: type !== "text" ? mediaUrl : undefined,
    });

    res.status(201).json({
      message: "Message sent successfully",
      data: message,
    });

  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const userId = req.user._id.toString();

    const isCustomer = order.customerId.toString() === userId;
    const isHandyman = order.handymanId.toString() === userId;

    if (!isCustomer && !isHandyman) {
      return res.status(403).json({
        message: "Unauthorized",
      });
    }

    const messages = await Message.find({ orderId })
      .populate("sender", "name profileImage role")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);

  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// ========== Delete a single message (soft delete, sender only) ==========
const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ message: "Message not found" });

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "لا يمكنك حذف رسالة لا تخصك" });
    }

    message.deleted = true;
    message.text = "";
    message.mediaUrl = null;
    await message.save();

    res.status(200).json({ message: "تم حذف الرسالة", data: message });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ========== Delete an entire conversation (either party, soft delete) ==========
const deleteConversation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const userId = req.user._id.toString();
    const isCustomer = order.customerId.toString() === userId;
    const isHandyman = order.handymanId.toString() === userId;
    if (!isCustomer && !isHandyman) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await Message.updateMany(
      { orderId },
      { deleted: true, text: "", mediaUrl: null }
    );

    res.status(200).json({ message: "تم حذف المحادثة" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  createMessage,
  getMessages,
  deleteMessage,
  deleteConversation,
};
