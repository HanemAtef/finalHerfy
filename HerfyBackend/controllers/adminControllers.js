const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const { createNotification } = require("./notificationController");

// FIX (Low #4): only adminModerationController.js's newer actions were
// writing AuditLog rows — these legacy endpoints had no audit trail at all
// for admin actions that ban a user, verify a handyman, or zero out a
// wallet debt. Same lightweight helper used there.
const logAction = (adminId, action, targetType, targetId, reason, meta = {}) =>
  AuditLog.create({ adminId, action, targetType, targetId, reason, meta });

// ========== 1. Get Admin Dashboard Statistics ==========
const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalHandymen = await User.countDocuments({ role: "handyman" });
    const totalCustomers = await User.countDocuments({ role: "customer" });
    const totalOrders = await Order.countDocuments();
    const completedOrders = await Order.countDocuments({ status: "completed" });
    const pendingOrders = await Order.countDocuments({ status: "pending" });
    const cancelledOrders = await Order.countDocuments({ status: "cancelled" });

    const revenueResult = await Order.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    res.status(200).json({
      totalUsers,
      totalHandymen,
      totalCustomers,
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      totalRevenue,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 2. Get All Users ==========
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      msg: "All users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 3. Ban / Unban a User ==========
const toggleUserBan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isBanned } = req.body;

    if (isBanned === undefined) {
      return res.status(400).json({ msg: "isBanned is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    user.isBanned = isBanned;
    await user.save();

    // FIX (Low #4): this legacy endpoint had no audit trail at all.
    await logAction(
      req.user._id,
      isBanned ? "user.ban" : "user.unban",
      "User",
      userId,
      "" // this legacy endpoint doesn't collect a reason; banUserWithReason does
    );

    //  Send notification
    const io = req.app.get('io');
    await createNotification(
      io,
      userId,
      'account_blocked',
      isBanned ? ' Account Blocked' : ' Account Unblocked',
      isBanned 
        ? 'Your account has been blocked for violating platform policies' 
        : 'Your account has been unblocked',
      { userId }
    );

    res.status(200).json({
      msg: `User ${isBanned ? "banned" : "unbanned"} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isBanned: user.isBanned,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 4. Get All Orders ==========
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customerId", "name email phone")
      .populate("handymanId", "name email phone profession")
      .sort({ createdAt: -1 });

    res.status(200).json({
      msg: "All orders retrieved successfully",
      data: orders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 5. Get Handymen Eligible for Auto-Verification ==========
const getPendingVerification = async (req, res) => {
  try {
    const handymen = await Handyman.find({ verified: false }).lean();
    const pending = [];

    if (handymen.length > 0) {
      const handymanIds = handymen.map((h) => h.userId);

      const orderStats = await Order.aggregate([
        {
          $match: {
            handymanId: { $in: handymanIds },
            status: { $in: ["completed", "cancelled"] },
          },
        },
        {
          $group: {
            _id: "$handymanId",
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          },
        },
      ]);

      const statsMap = orderStats.reduce((acc, curr) => {
        acc[curr._id.toString()] = curr;
        return acc;
      }, {});

      const users = await User.find({ _id: { $in: handymanIds } })
        .select("name email phone")
        .lean();
      const userMap = users.reduce((acc, curr) => {
        acc[curr._id.toString()] = curr;
        return acc;
      }, {});

      for (const handyman of handymen) {
        const stats = statsMap[handyman.userId.toString()] || { completed: 0, cancelled: 0 };
        const completedOrders = stats.completed;
        const cancelledOrders = stats.cancelled;

        const totalOrders = completedOrders + cancelledOrders;
        const cancellationRate =
          totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

        const meetsConditions =
          completedOrders >= 10 &&
          handyman.rating >= 4.5 &&
          cancellationRate < 10;

        if (meetsConditions) {
          const user = userMap[handyman.userId.toString()];

          pending.push({
            userId: handyman.userId,
            name: user?.name || "Unknown",
            email: user?.email,
            phone: user?.phone,
            profession: handyman.profession,
            rating: handyman.rating,
            completedOrders,
            cancellationRate: Math.round(cancellationRate * 100) / 100,
            isVerified: handyman.verified,
          });
        }
      }
    }

    res.status(200).json({
      msg: "Handymen eligible for verification",
      data: pending,
      total: pending.length,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 6. Auto-Verify a Specific Handyman ==========
const autoVerifyHandyman = async (req, res) => {
  try {
    const { handymanId } = req.params;

    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    if (handyman.verified) {
      return res.status(400).json({ msg: "Handyman is already verified" });
    }

    const completedOrders = await Order.countDocuments({
      handymanId: handymanId,
      status: "completed",
    });

    const cancelledOrders = await Order.countDocuments({
      handymanId: handymanId,
      status: "cancelled",
    });

    const totalOrders = completedOrders + cancelledOrders;
    const cancellationRate =
      totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

    const meetsConditions =
      completedOrders >= 10 &&
      handyman.rating >= 4.5 &&
      cancellationRate < 10;

    if (!meetsConditions) {
      return res.status(400).json({
        msg: "Handyman does not meet verification conditions",
        requirements: {
          completedOrders: { current: completedOrders, required: 10 },
          rating: { current: handyman.rating, required: 4.5 },
          cancellationRate: {
            current: Math.round(cancellationRate * 100) / 100,
            required: "< 10%",
          },
        },
      });
    }

    handyman.verified = true;
    await handyman.save();

    // FIX (Low #4): this legacy endpoint had no audit trail at all.
    await logAction(
      req.user._id,
      "handyman.autoVerify",
      "Handyman",
      handyman._id,
      "meets auto-verification thresholds",
      { completedOrders, cancellationRate: Math.round(cancellationRate * 100) / 100 }
    );

    //  Send notification
    const io = req.app.get('io');
    await createNotification(
      io,
      handymanId,
      'handyman_verified',
      ' Account Verified',
      'Your account has been verified as a trusted handyman ✓',
      { handymanId }
    );

    res.status(200).json({
      msg: "Handyman verified successfully",
      handyman: {
        userId: handyman.userId,
        profession: handyman.profession,
        rating: handyman.rating,
        verified: handyman.verified,
        completedOrders,
        cancellationRate: Math.round(cancellationRate * 100) / 100,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 7. Auto-Verify All Eligible Handymen ==========
const autoVerifyAll = async (req, res) => {
  try {
    const handymen = await Handyman.find({ verified: false });
    let verifiedCount = 0;
    const results = [];

    for (const handyman of handymen) {
      const userId = handyman.userId;

      const completedOrders = await Order.countDocuments({
        handymanId: userId,
        status: "completed",
      });

      const cancelledOrders = await Order.countDocuments({
        handymanId: userId,
        status: "cancelled",
      });

      const totalOrders = completedOrders + cancelledOrders;
      const cancellationRate =
        totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

      if (
        completedOrders >= 10 &&
        handyman.rating >= 4.5 &&
        cancellationRate < 10
      ) {
        handyman.verified = true;
        await handyman.save();
        // FIX (Low #4): this legacy endpoint had no audit trail at all —
        // one entry per handyman actually verified by this sweep.
        await logAction(
          req.user._id,
          "handyman.autoVerify",
          "Handyman",
          handyman._id,
          "meets auto-verification thresholds (bulk sweep)",
          { completedOrders, cancellationRate: Math.round(cancellationRate * 100) / 100 }
        );
        verifiedCount++;
        results.push({
          userId: handyman.userId,
          profession: handyman.profession,
          rating: handyman.rating,
          verified: true,
        });
      }
    }

    res.status(200).json({
      msg: `${verifiedCount} handymen verified successfully`,
      verifiedCount,
      results,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Wallets: list handymen with outstanding commission debt ==========
const getWallets = async (req, res) => {
  try {
    const handymen = await Handyman.find({ walletBalance: { $gt: 0 } })
      .populate("userId", "name email phone")
      .sort({ walletBalance: -1 });

    res.status(200).json({ data: handymen });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Wallets: admin marks a handyman's debt as settled ==========
const settleWallet = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const handyman = await Handyman.findById(handymanId);

    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    const settledAmount = handyman.walletBalance;
    handyman.walletBalance = 0;
    handyman.isSuspended = false;
    handyman.suspendedReason = null;
    await handyman.save();

    // FIX (Low #4): this legacy endpoint had no audit trail at all — worth
    // having given it zeroes out a real commission debt.
    await logAction(
      req.user._id,
      "wallet.settle",
      "Handyman",
      handyman._id,
      "",
      { settledAmount }
    );

    const io = req.app.get("io");
    await createNotification(
      io,
      handyman.userId,
      "system_alert",
      " Wallet Settled",
      `تم تسوية رصيد العمولة (${settledAmount} ج.م) وتفعيل حسابك مجدداً`,
      { settledAmount }
    );

    res.status(200).json({ msg: "Wallet settled", handyman });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};
 
//getDashboardChart

const getDashboardChart = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    const usersPerMonth = await User.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          users: { $sum: 1 },
        },
      },
    ]);

    const ordersPerMonth = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          orders: { $sum: 1 },
          revenue: { $sum: "$commissionAmount" },
        },
      },
    ]);

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const chart = months.map((month, index) => {
      const user = usersPerMonth.find((u) => u._id === index + 1);
      const order = ordersPerMonth.find((o) => o._id === index + 1);

      return {
        month,
        users: user?.users || 0,
        orders: order?.orders || 0,
        revenue: order?.revenue || 0,
      };
    });

    res.status(200).json({
      success: true,
      data: chart,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      msg: "Server error",
      error: error.message,
    });
  }
};
// ========== Broadcast a general announcement to users ==========
// audience: "all" | "customer" | "handyman" — sent as a system_alert
// notification to every matching user, and logged in the audit trail.
const broadcastAnnouncement = async (req, res) => {
  try {
    const { title, body, audience = "all" } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ msg: "العنوان ونص التنبيه مطلوبين" });
    }
    if (!["all", "customer", "handyman"].includes(audience)) {
      return res.status(400).json({ msg: "audience غير صالح" });
    }

    const filter = audience === "all" ? {} : { role: audience };
    const recipients = await User.find(filter).select("_id").lean();

    const io = req.app.get("io");
    await Promise.all(
      recipients.map((u) =>
        createNotification(io, u._id, "system_alert", title.trim(), body.trim(), { audience })
      )
    );

    await logAction(
      req.user._id,
      "system.broadcast",
      "User",
      null,
      title.trim(),
      { audience, recipientCount: recipients.length }
    );

    res.status(200).json({
      msg: "تم نشر التنبيه بنجاح",
      recipientCount: recipients.length,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  toggleUserBan,
  getAllOrders,
  getPendingVerification,
  autoVerifyHandyman,
  autoVerifyAll,
  getWallets,
  settleWallet,
  getDashboardChart,
  broadcastAnnouncement,
};