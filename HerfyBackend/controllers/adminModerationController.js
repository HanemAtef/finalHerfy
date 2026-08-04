// Admin moderation: approve / reject / suspend / delete craftsmen, ban users
// with a reason, and the audit log reader. Every mutating action here writes
// an AuditLog row.
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const AuditLog = require("../models/AuditLog");
const RefreshToken = require("../models/RefreshToken");
const { createNotification } = require("./notificationController");

const logAction = (adminId, action, targetType, targetId, reason, meta = {}) =>
  AuditLog.create({ adminId, action, targetType, targetId, reason, meta });

// ========== Approve a handyman's verification ==========
const approveHandyman = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { reason = "" } = req.body;

    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) return res.status(404).json({ msg: "Handyman not found" });

    handyman.verified = true;
    handyman.rejected = false;
    handyman.rejectedReason = null;
    await handyman.save();

    await logAction(req.user._id, "handyman.approve", "Handyman", handyman._id, reason);

    const io = req.app.get("io");
    await createNotification(
      io, handymanId, "handyman_verified",
      "تم توثيق الحساب", "تمت الموافقة على حسابك كحرفي موثق ✓",
      { handymanId }
    );

    res.status(200).json({ msg: "تم توثيق الحرفي", handyman });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Reject a handyman's verification (with a reason) ==========
const rejectHandyman = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ msg: "سبب الرفض مطلوب" });

    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) return res.status(404).json({ msg: "Handyman not found" });

    handyman.verified = false;
    handyman.rejected = true;
    handyman.rejectedReason = reason;
    await handyman.save();

    await logAction(req.user._id, "handyman.reject", "Handyman", handyman._id, reason);

    const io = req.app.get("io");
    await createNotification(
      io, handymanId, "handyman_rejected",
      "تم رفض طلب التوثيق", `تم رفض طلب توثيق حسابك: ${reason}`,
      { handymanId, reason }
    );

    res.status(200).json({ msg: "تم رفض الحرفي", handyman });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Suspend / unsuspend a handyman (with a reason) ==========
const suspendHandyman = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { suspended, reason = "" } = req.body;
    if (suspended === undefined) return res.status(400).json({ msg: "suspended is required" });
    if (suspended && !reason) return res.status(400).json({ msg: "سبب التعليق مطلوب" });

    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) return res.status(404).json({ msg: "Handyman not found" });

    handyman.isSuspended = suspended;
    handyman.suspendedReason = suspended ? reason : null;
    await handyman.save();

    await logAction(
      req.user._id,
      suspended ? "handyman.suspend" : "handyman.unsuspend",
      "Handyman", handyman._id, reason
    );

    const io = req.app.get("io");
    await createNotification(
      io, handymanId, suspended ? "handyman_suspended" : "handyman_unsuspended",
      suspended ? "تم تعليق الحساب" : "تم إلغاء تعليق الحساب",
      suspended ? `تم تعليق حسابك مؤقتاً: ${reason}` : "تم إعادة تفعيل حسابك",
      { handymanId, reason }
    );

    res.status(200).json({ msg: suspended ? "تم تعليق الحرفي" : "تم إلغاء التعليق", handyman });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Delete a craftsman/user account (with a reason) ==========
const deleteUserAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ msg: "سبب الحذف مطلوب" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });
    if (user.isAdmin) return res.status(400).json({ msg: "لا يمكن حذف حساب أدمن" });
    if (user.deletedAt) return res.status(400).json({ msg: "الحساب محذوف بالفعل" });

    // FIX (M4): previously hard-deleted the User (and Handyman) row, leaving
    // Order/Message/Review/Notification/RefreshToken documents pointing at
    // a now-nonexistent user — every populate() of that field silently
    // returns null, permanently losing which party was involved in
    // historical orders. Soft-delete instead: the row (and its history)
    // stays intact, the account is blocked from logging in
    // (see authMiddleware/socketAuth/loginUser/refreshAccessToken), and it
    // drops out of "nearby handymen" results because the Handyman profile
    // (a separate, non-historical record) is still removed.
    user.deletedAt = new Date();
    user.isBanned = true;
    user.banReason = reason;
    await user.save();

    await Handyman.deleteOne({ userId });

    // Kill every active session immediately rather than waiting for access
    // tokens to expire naturally.
    await RefreshToken.updateMany({ userId, revoked: false }, { revoked: true });

    await logAction(req.user._id, "user.delete", "User", userId, reason, {
      name: user.name, email: user.email, role: user.role,
    });

    res.status(200).json({ msg: "تم حذف الحساب" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Ban / unban with a reason (extends toggleUserBan) ==========
const banUserWithReason = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isBanned, reason = "" } = req.body;
    if (isBanned === undefined) return res.status(400).json({ msg: "isBanned is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.isBanned = isBanned;
    user.banReason = isBanned ? reason : null;
    await user.save();

    await logAction(req.user._id, isBanned ? "user.ban" : "user.unban", "User", userId, reason);

    const io = req.app.get("io");
    await createNotification(
      io, userId, "account_blocked",
      isBanned ? "تم حظر الحساب" : "تم إلغاء حظر الحساب",
      isBanned ? `تم حظر حسابك: ${reason || "مخالفة سياسات المنصة"}` : "تم إلغاء حظر حسابك",
      { userId, reason }
    );

    res.status(200).json({
      msg: `User ${isBanned ? "banned" : "unbanned"} successfully`,
      user: { id: user._id, name: user.name, email: user.email, isBanned: user.isBanned, banReason: user.banReason },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Audit log (paginated, filterable by action/admin) ==========
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 30, action, adminId } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (adminId) filter.adminId = adminId;

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("adminId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      data: logs,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Lift a pending-review suspension early (admin action) ==========
const liftPendingReviewSuspension = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = '' } = req.body;

    const user = await User.findById(userId);
    const handyman = await Handyman.findOne({ userId });

    if (!user) return res.status(404).json({ msg: 'User not found' });

    let lifted = false;
    if (user.isSuspendedPendingReview) {
      user.isSuspendedPendingReview = false;
      user.suspendedPendingReviewReason = null;
      await user.save();
      lifted = true;
    }
    if (handyman?.isSuspendedPendingReview) {
      handyman.isSuspendedPendingReview = false;
      handyman.suspendedPendingReviewReason = null;
      await handyman.save();
      lifted = true;
    }

    if (!lifted) return res.status(400).json({ msg: 'User is not suspended pending review' });

    await logAction(req.user._id, 'user.liftSuspension', 'User', userId, reason);

    const io = req.app.get('io');
    await createNotification(
      io, userId, 'system_alert',
      '✅ تم رفع التعليق المؤقت',
      'تم رفع التعليق المؤقت عن حسابك بعد مراجعة الأدمن. يمكنك الآن استخدام المنصة بشكل طبيعي.',
      { reason }
    );

    res.status(200).json({ msg: 'Suspension lifted successfully' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

module.exports = {
  approveHandyman,
  rejectHandyman,
  suspendHandyman,
  deleteUserAccount,
  banUserWithReason,
  getAuditLogs,
  liftPendingReviewSuspension,
};
