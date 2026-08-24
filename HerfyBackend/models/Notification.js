const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "order_created",
        "order_accepted",
        "order_rejected",
        "order_cancelled",
        "order_completed",
        "price_confirmed",
        "emergency_request",
        "reschedule_request",
        "reschedule_response",
        "new_message",
        "handyman_verified",
        "handyman_rejected",
        "handyman_suspended",
        "handyman_unsuspended",
        "account_deleted",
        "report_filed",
        "report_resolved",
        "payment_confirmed",
        "payment_method_selected",
        "payment_failed",
        "penalty_warning",
        "account_blocked",
        "system_alert",
        "promotion",
        "handyman_on_the_way",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    data: {
      type: Object,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 604800, // 7 days (TTL index)
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
