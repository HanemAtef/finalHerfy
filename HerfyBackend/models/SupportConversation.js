const mongoose = require("mongoose");

const supportConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    userRole: {
      type: String,
      enum: ["customer", "handyman"],
      required: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    userPhone: {
      type: String,
      trim: true,
    },
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    unreadAdminCount: {
      type: Number,
      default: 0,
    },
    unreadUserCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
  },
  { timestamps: true }
);

supportConversationSchema.index({ lastMessageAt: -1 });
supportConversationSchema.index({ unreadAdminCount: 1 });
supportConversationSchema.index({ userRole: 1 });

const SupportConversation = mongoose.model("SupportConversation", supportConversationSchema);
module.exports = SupportConversation;
