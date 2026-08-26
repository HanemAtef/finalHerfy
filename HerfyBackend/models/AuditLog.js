const mongoose = require("mongoose");

// Every admin action that changes platform state (approve/reject/suspend/
// ban/delete/resolve a dispute/edit reference data...) gets one row here,
// so there's always a trail of who did what and why.
const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    action: {
      type: String,
      required: true, // e.g. "handyman.approve", "user.ban", "report.resolve"
    },
    targetType: {
      type: String, // "User" | "Handyman" | "Order" | "Report" | "ServiceType"
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    reason: {
      type: String,
      default: "",
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminId: 1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
module.exports = AuditLog;
