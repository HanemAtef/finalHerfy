const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportConversation",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    senderRole: {
      type: String,
      enum: ["customer", "handyman", "admin"],
      required: true,
    },
    text: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["text", "image", "audio"],
      default: "text",
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

supportMessageSchema.index({ conversationId: 1, createdAt: 1 });
supportMessageSchema.index({ senderId: 1 });

const SupportMessage = mongoose.model("SupportMessage", supportMessageSchema);
module.exports = SupportMessage;
