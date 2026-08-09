const mongoose = require("mongoose");

// A complaint filed by either party on an order — the admin resolution
// flow (adminControllers.resolveReport) drives the order back to a normal
// status or keeps it cancelled, and always leaves an AuditLog entry.
const reportSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    against: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "reviewing", "resolved", "dismissed"],
      default: "pending",
    },
    resolution: {
      type: String,
      default: "",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: Date,
    orderStatusAtReport: {
      type: String
    },

    // Escalation
    slaDeadline: {
      type: Date,
      default: null,
    },
    isEscalated: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

reportSchema.index({ orderId: 1 });
reportSchema.index({ status: 1 });

const Report = mongoose.model("Report", reportSchema);
module.exports = Report;
