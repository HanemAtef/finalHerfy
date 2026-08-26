// HerfyBackend/controllers/adminControllers.js
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const Review = require("../models/Review");
const AuditLog = require("../models/AuditLog");
const RefreshToken = require("../models/RefreshToken");
const FinancialRecord = require("../models/FinancialRecord");
const SettlementRequest = require("../models/SettlementRequest");
const { createNotification } = require("./notificationController");

// ========== Helper: Log admin actions ==========
const logAction = (adminId, action, targetType, targetId, reason, meta = {}) =>
  AuditLog.create({ adminId, action, targetType, targetId, reason, meta });

// ========== Helper: Send approval/rejection email ==========
const sendApprovalEmail = async (email, name, status, note) => {
  try {
    const sendEmail = require('../utils/sendEmail');
    
    const subject = status === 'approved' 
      ? '✅ تم الموافقة على طلب تسجيلك كحرفي في هرفي' 
      : '❌ تم رفض طلب تسجيلك كحرفي في هرفي';

    const html = `
      <div dir="rtl" style="font-family: 'Tahoma', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; padding: 15px 0; background: linear-gradient(135deg, #4CAF50, #45a049); border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🏠 هرفي</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">منصة الحرفيين الموثوقين</p>
        </div>
        
        <div style="text-align: center; padding: 10px 0;">
          <div style="font-size: 60px; margin: 10px 0;">
            ${status === 'approved' ? '🎉' : '😔'}
          </div>
          <h2 style="color: ${status === 'approved' ? '#4CAF50' : '#f44336'}; margin: 0;">
            ${status === 'approved' ? 'تهانينا!' : 'عذراً'}
          </h2>
        </div>
        
        <div style="padding: 0 10px;">
          <h3 style="color: #333; margin-bottom: 10px;">السلام عليكم ${name}</h3>
          
          <p style="font-size: 16px; line-height: 1.8; color: #444; margin-bottom: 20px;">
            ${status === 'approved' 
              ? 'يسرنا إبلاغك بأنه تم الموافقة على طلب التسجيل الخاص بك كحرفي في منصة هرفي. 🎊'
              : 'نأسف لإبلاغك بأن طلب التسجيل الخاص بك كحرفي في منصة هرفي لم يتم الموافقة عليه.'
            }
          </p>
          
          <div style="background-color: #f8f9fa; padding: 15px 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid ${status === 'approved' ? '#4CAF50' : '#f44336'};">
            <strong style="color: #333; font-size: 15px;">📝 ملاحظة من الأدمن:</strong>
            <p style="margin: 10px 0 0 0; color: #555; font-size: 15px; line-height: 1.6;">${note}</p>
          </div>
          
          <div style="background-color: #e8f5e9; padding: 12px 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #4CAF50;">
            <p style="margin: 0; color: #2e7d32; font-size: 14px;">
              ${status === 'approved' 
                ? '🔑 يمكنك الآن تسجيل الدخول من خلال التطبيق والبدء في عرض خدماتك واستقبال الطلبات.'
                : '💡 يمكنك محاولة التقديم مرة أخرى مع التأكد من استيفاء جميع الشروط المطلوبة وتقديم المعلومات الصحيحة.'
              }
            </p>
          </div>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p style="margin: 0;">هذا بريد إلكتروني آلي، يرجى عدم الرد عليه.</p>
          <p style="margin: 5px 0 0 0;">© 2024 هرفي - جميع الحقوق محفوظة</p>
        </div>
      </div>
    `;

    await sendEmail(email, subject, html);
    console.log(`✅ Approval email sent to ${email} with status: ${status}`);

  } catch (error) {
    console.error('❌ Error sending approval email:', error);
    throw error;
  }
};

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
    const orderRevenue = revenueResult[0]?.total || 0;

    const fineRevenueResult = await FinancialRecord.aggregate([
      { $match: { type: "fine_payment", status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const fineRevenue = fineRevenueResult[0]?.total || 0;

    const totalRevenue = orderRevenue + fineRevenue;
    const pendingSettlements = await SettlementRequest.countDocuments({ status: "pending" });

    res.status(200).json({
      totalUsers,
      totalHandymen,
      totalCustomers,
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      totalRevenue,
      fineRevenue,
      pendingSettlements,
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

    await logAction(
      req.user._id,
      isBanned ? "user.ban" : "user.unban",
      "User",
      userId,
      ""
    );

    const io = req.app.get('io');
    await createNotification(
      io,
      userId,
      'account_blocked',
      isBanned ? 'Account Blocked' : 'Account Unblocked',
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

    await logAction(
      req.user._id,
      "handyman.autoVerify",
      "Handyman",
      handyman._id,
      "meets auto-verification thresholds",
      { completedOrders, cancellationRate: Math.round(cancellationRate * 100) / 100 }
    );

    const io = req.app.get('io');
    await createNotification(
      io,
      handymanId,
      'handyman_verified',
      'Account Verified',
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

// ========== 8. Wallets: list handymen with outstanding commission debt ==========
const getWallets = async (req, res) => {
  try {
    const handymen = await Handyman.find({
      $or: [{ walletBalance: { $gt: 0 } }, { pendingEarnings: { $gt: 0 } }],
    })
      .populate('userId', 'name email phone')
      .sort({ walletBalance: -1 });

    res.status(200).json({ data: handymen });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== Payout: admin marks handyman earnings as paid out ==========
const payoutHandyman = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { note = '' } = req.body;
    const PayoutHistory = require('../models/PayoutHistory');

    const handyman = await Handyman.findById(handymanId);
    if (!handyman) return res.status(404).json({ msg: 'Handyman not found' });
    if (!handyman.pendingEarnings || handyman.pendingEarnings <= 0) {
      return res.status(400).json({ msg: 'لا توجد مستحقات معلقة لهذا الحرفي' });
    }

    const amount = handyman.pendingEarnings;
    handyman.totalPaidOut = (handyman.totalPaidOut || 0) + amount;
    handyman.pendingEarnings = 0;
    await handyman.save();

    await PayoutHistory.create({
      handymanId: handyman._id,
      amount,
      processedBy: req.user._id,
      note,
    });

    await logAction(
      req.user._id, 'wallet.payout', 'Handyman', handyman._id, note,
      { amount }
    );

    const io = req.app.get('io');
    await createNotification(
      io, handyman.userId, 'payment_confirmed',
      'تم تحويل مستحقاتك',
      `تم تحويل مبلغ ${amount} ج.م إلى حسابك.`,
      { amount }
    );

    res.status(200).json({ msg: 'تم تسجيل التحويل بنجاح', amount, handyman });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== Payout: get payout history for a handyman ==========
const getPayoutHistory = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const PayoutHistory = require('../models/PayoutHistory');
    const history = await PayoutHistory.find({ handymanId })
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ data: history });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== 9. Wallets: admin marks a handyman's debt as settled ==========
const settleWallet = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const handyman = await Handyman.findById(handymanId);

    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    const { WALLET_DEBT_SUSPENSION_REASON } = require("../utils/constants");
    const settledAmount = handyman.walletBalance;
    handyman.walletBalance = 0;
    
    let suspensionCleared = false;
    if (handyman.isSuspended && handyman.suspendedReason === WALLET_DEBT_SUSPENSION_REASON) {
      handyman.isSuspended = false;
      handyman.suspendedReason = null;
      suspensionCleared = true;
    }
    await handyman.save();

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
      "Wallet Settled",
      suspensionCleared 
        ? `تم تسوية رصيد العمولة (${settledAmount} ج.م) وتفعيل حسابك مجدداً`
        : `تم تسوية رصيد العمولة (${settledAmount} ج.م)`,
      { settledAmount }
    );

    res.status(200).json({ 
      msg: "Wallet settled", 
      handyman, 
      walletSettledButStillSuspended: handyman.isSuspended 
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 10. Get Dashboard Chart Data ==========
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

// ========== 11. Broadcast Announcement ==========
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

// ========== 11b. Get full profile for one user (customer or handyman) ==========
// Powers the admin "click a name -> profile page" screen: basic info,
// the handyman's portfolio/gallery, stats, and every order they were
// ever part of on the platform (their job history).
const getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    const isHandyman = user.role === "handyman";

    const handymanProfile = isHandyman
      ? await Handyman.findOne({ userId: user._id }).lean()
      : null;

    const orderFilter = isHandyman ? { handymanId: user._id } : { customerId: user._id };
    const orders = await Order.find(orderFilter)
      .populate("customerId", "name")
      .populate("handymanId", "name")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const ordersOut = orders.map((o) => ({
      _id: o._id,
      serviceType: o.profession,
      customerId: o.customerId,
      handymanId: o.handymanId,
      finalPrice: o.totalPrice || o.price || o.estimatedPrice || 0,
      createdAt: o.createdAt,
      status: o.status,
    }));

    const totalOrders = await Order.countDocuments(orderFilter);
    const completedOrders = await Order.countDocuments({ ...orderFilter, status: "completed" });
    const cancelledOrders = await Order.countDocuments({ ...orderFilter, status: "cancelled" });

    let reviews = [];
    if (isHandyman) {
      reviews = await Review.find({ handymanId: user._id })
        .populate("customerId", "name")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    }

    const stats = {
      totalOrders,
      completedOrders,
      cancelledOrders,
      rating: handymanProfile?.rating || 0,
      walletBalance: handymanProfile?.walletBalance || 0,
      gallery: handymanProfile?.gallery || [],
    };

    // Consolidate documents from User and Handyman
    const userDocs = Array.isArray(user.documents) ? [...user.documents] : [];
    if (user.nationalId && !userDocs.some((d) => d.type === 'national_id' || d.url === user.nationalId)) {
      userDocs.unshift({
        type: 'national_id',
        url: user.nationalId,
        filename: 'national_id',
        originalName: 'بطاقة الرقم القومي',
        mimeType: /\.pdf($|\?)/i.test(user.nationalId) ? 'application/pdf' : 'image/jpeg',
        uploadedAt: user.createdAt,
        status: user.status === 'approved' ? 'verified' : 'pending',
      });
    }

    if (handymanProfile) {
      if (handymanProfile.nationalId && !userDocs.some((d) => d.url === handymanProfile.nationalId)) {
        userDocs.unshift({
          type: 'national_id',
          url: handymanProfile.nationalId,
          filename: 'national_id',
          originalName: 'بطاقة الرقم القومي',
          mimeType: /\.pdf($|\?)/i.test(handymanProfile.nationalId) ? 'application/pdf' : 'image/jpeg',
          uploadedAt: handymanProfile.registeredAt || handymanProfile.createdAt,
          status: handymanProfile.registrationStatus === 'approved' ? 'verified' : 'pending',
        });
      }
      if (handymanProfile.certificate && !userDocs.some((d) => d.url === handymanProfile.certificate)) {
        userDocs.push({
          type: 'certificate',
          url: handymanProfile.certificate,
          filename: 'certificate',
          originalName: 'شهادة الخبرة',
          mimeType: /\.pdf($|\?)/i.test(handymanProfile.certificate) ? 'application/pdf' : 'image/jpeg',
          uploadedAt: handymanProfile.registeredAt || handymanProfile.createdAt,
          status: handymanProfile.registrationStatus === 'approved' ? 'verified' : 'pending',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...user.toObject ? user.toObject() : user,
          documents: userDocs,
        },
        documents: userDocs,
        handymanProfile,
        stats,
        orders: ordersOut,
        reviews,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 11c. Get User Documents specifically ==========
const getUserDocuments = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    const handymanProfile = user.role === "handyman"
      ? await Handyman.findOne({ userId: user._id }).lean()
      : null;

    const userDocs = Array.isArray(user.documents) ? [...user.documents] : [];
    if (user.nationalId && !userDocs.some((d) => d.type === 'national_id' || d.url === user.nationalId)) {
      userDocs.unshift({
        type: 'national_id',
        url: user.nationalId,
        filename: 'national_id',
        originalName: 'بطاقة الرقم القومي',
        mimeType: /\.pdf($|\?)/i.test(user.nationalId) ? 'application/pdf' : 'image/jpeg',
        uploadedAt: user.createdAt,
        status: user.status === 'approved' ? 'verified' : 'pending',
      });
    }

    if (handymanProfile) {
      if (handymanProfile.nationalId && !userDocs.some((d) => d.url === handymanProfile.nationalId)) {
        userDocs.unshift({
          type: 'national_id',
          url: handymanProfile.nationalId,
          filename: 'national_id',
          originalName: 'بطاقة الرقم القومي',
          mimeType: /\.pdf($|\?)/i.test(handymanProfile.nationalId) ? 'application/pdf' : 'image/jpeg',
          uploadedAt: handymanProfile.registeredAt || handymanProfile.createdAt,
          status: handymanProfile.registrationStatus === 'approved' ? 'verified' : 'pending',
        });
      }
      if (handymanProfile.certificate && !userDocs.some((d) => d.url === handymanProfile.certificate)) {
        userDocs.push({
          type: 'certificate',
          url: handymanProfile.certificate,
          filename: 'certificate',
          originalName: 'شهادة الخبرة',
          mimeType: /\.pdf($|\?)/i.test(handymanProfile.certificate) ? 'application/pdf' : 'image/jpeg',
          uploadedAt: handymanProfile.registeredAt || handymanProfile.createdAt,
          status: handymanProfile.registrationStatus === 'approved' ? 'verified' : 'pending',
        });
      }
    }

    res.status(200).json({
      success: true,
      userId: user._id,
      name: user.name,
      role: user.role,
      documents: userDocs,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// =====================================================
// ========== NEW: Registration Request Management ==========
// =====================================================

// ========== 12. Get All Pending/Historical Registration Requests ==========
const getPendingRegistrationRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter.registrationStatus = status;
    } else if (!status) {
      filter.registrationStatus = 'pending';
    }

    const pendingHandymen = await Handyman.find(filter)
      .populate('userId', 'name email phone profileImage status isVerified createdAt')
      .sort({ registeredAt: -1, createdAt: -1 });

    const formatted = pendingHandymen.map((h) => {
      const u = h.userId || {};
      return {
        _id: h._id,
        handymanId: h._id,
        userId: u._id || h.userId,
        name: u.name || '—',
        email: u.email || '—',
        phone: u.phone || '—',
        profession: h.profession || '—',
        price: h.price,
        experienceYears: h.experienceYears,
        bio: h.bio || '',
        address: h.address || '',
        nationalId: h.nationalId || '',
        certificate: h.certificate || '',
        profileImage: h.profileImage || u.profileImage || '',
        gallery: h.gallery || [],
        status: h.registrationStatus || u.status || 'pending',
        registrationStatus: h.registrationStatus || 'pending',
        adminNote: h.adminNote || h.rejectedReason || '',
        createdAt: h.registeredAt || h.createdAt || u.createdAt,
        registeredAt: h.registeredAt || h.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error('Error fetching pending registration requests:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== 13. Approve Registration Request ==========
const approveRegistrationRequest = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { note = '' } = req.body;

    // Find handyman by Handyman _id or userId
    let handyman = await Handyman.findById(handymanId).populate('userId');
    if (!handyman) {
      handyman = await Handyman.findOne({ userId: handymanId }).populate('userId');
    }

    let user = null;
    if (handyman) {
      user = handyman.userId;
      handyman.registrationStatus = 'approved';
      handyman.approvedAt = new Date();
      handyman.adminNote = note || 'تم الموافقة على حسابك';
      handyman.verified = Boolean((handyman.completedOrders || 0) >= 10 && (handyman.rating || 0) >= 4.5);
      handyman.rejected = false;
      handyman.rejectedReason = null;
      await handyman.save();
    } else {
      user = await User.findById(handymanId);
    }

    if (!user && !handyman) {
      return res.status(404).json({
        success: false,
        msg: 'طلب التسجيل غير موجود',
      });
    }

    // Update user status
    if (user) {
      user.status = 'approved';
      user.isVerified = true;
      await user.save();
    }

    // Log action
    await logAction(
      req.user._id,
      'registration.approve',
      'User',
      user?._id || handyman?._id,
      note || 'تم الموافقة على طلب التسجيل',
      {
        handymanName: user?.name,
        profession: handyman?.profession,
        email: user?.email,
      }
    );

    // Send Socket.io notification
    const io = req.app.get('io');
    if (io) {
      io.emit('registrationApproved', {
        handymanId: handyman?._id,
        userId: user?._id,
        name: user?.name,
        status: 'approved',
      });
    }

    // Send in-app notification
    if (user) {
      await createNotification(
        io,
        user._id,
        'registration_approved',
        '✅ تم الموافقة على طلب التسجيل',
        'تم قبول طلب تسجيلك في منصة هرفي. يمكنك الآن تسجيل الدخول واستخدام المنصة.',
        { handymanId: handyman?._id }
      ).catch(() => {});
    }

    // Send email
    try {
      if (user?.email) {
        await sendApprovalEmail(
          user.email,
          user.name,
          'approved',
          handyman?.adminNote || 'تم الموافقة على حسابك'
        );
      }
    } catch (emailErr) {
      console.error('Error sending approval email:', emailErr.message);
    }

    res.status(200).json({
      success: true,
      msg: 'تم الموافقة على طلب التسجيل بنجاح',
      data: handyman || user,
    });
  } catch (error) {
    console.error('Error approving registration:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== 14. Reject Registration Request ==========
const rejectRegistrationRequest = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { reason = 'تم رفض طلب التسجيل' } = req.body;

    // Find handyman by Handyman _id or userId
    let handyman = await Handyman.findById(handymanId).populate('userId');
    if (!handyman) {
      handyman = await Handyman.findOne({ userId: handymanId }).populate('userId');
    }

    let user = null;
    if (handyman) {
      user = handyman.userId;
      handyman.registrationStatus = 'rejected';
      handyman.rejectedAt = new Date();
      handyman.adminNote = reason;
      handyman.verified = false;
      handyman.rejected = true;
      handyman.rejectedReason = reason;
      await handyman.save();
    } else {
      user = await User.findById(handymanId);
    }

    if (!user && !handyman) {
      return res.status(404).json({
        success: false,
        msg: 'طلب التسجيل غير موجود',
      });
    }

    // Update user status
    if (user) {
      user.status = 'rejected';
      await user.save();
    }

    // Log action
    await logAction(
      req.user._id,
      'registration.reject',
      'User',
      user?._id || handyman?._id,
      reason,
      {
        handymanName: user?.name,
        profession: handyman?.profession,
        email: user?.email,
      }
    );

    // Send Socket.io notification
    const io = req.app.get('io');
    if (io) {
      io.emit('registrationRejected', {
        handymanId: handyman?._id,
        userId: user?._id,
        name: user?.name,
        status: 'rejected',
        reason: reason,
      });
    }

    // Send in-app notification
    if (user) {
      await createNotification(
        io,
        user._id,
        'registration_rejected',
        '❌ تم رفض طلب التسجيل',
        `نأسف لإبلاغك بأن طلب تسجيلك قد تم رفضه. السبب: ${reason}`,
        { handymanId: handyman?._id, reason }
      ).catch(() => {});
    }

    // Send email
    try {
      if (user?.email) {
        await sendApprovalEmail(
          user.email,
          user.name,
          'rejected',
          reason
        );
      }
    } catch (emailErr) {
      console.error('Error sending rejection email:', emailErr.message);
    }

    res.status(200).json({
      success: true,
      msg: 'تم رفض طلب التسجيل بنجاح',
      data: handyman || user,
    });
  } catch (error) {
    console.error('Error rejecting registration:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== Get Fine Payments (Card Payments) ==========
const getFinePayments = async (req, res) => {
  try {
    const records = await FinancialRecord.find({ type: 'fine_payment' })
      .populate('handymanId', 'name email phone profileImage')
      .populate('fineId')
      .sort({ createdAt: -1 });

    res.status(200).json({ data: records });
  } catch (error) {
    console.error('Error fetching fine payments:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// =====================================================
// ========== EXPORTS ==========
// =====================================================

module.exports = {
  // Dashboard & Stats
  getAdminStats,
  getDashboardChart,
  getFinePayments,
  
  // User Management
  getAllUsers,
  toggleUserBan,
  
  // Order Management
  getAllOrders,
  
  // Handyman Verification (Auto)
  getPendingVerification,
  autoVerifyHandyman,
  autoVerifyAll,
  
  // Wallet Management
  getWallets,
  settleWallet,
  payoutHandyman,
  getPayoutHistory,
  
  // Announcements
  broadcastAnnouncement,
  getUserDetail,
  getUserDocuments,
  
  // Registration Request Management (NEW)
  getPendingRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
};