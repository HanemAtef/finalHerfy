// Detailed admin analytics (overview/craftsmen/jobs/reviews) + generic CSV
// export. Kept dependency-free (no csv library) — a tiny hand-rolled writer
// is enough for admin-facing exports.
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const Review = require("../models/Review");

const toCSV = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
};

// ========== Overview: platform-wide KPIs over time ==========
const getOverviewAnalytics = async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [newUsers, newOrders, revenueAgg, ordersByStatus, signupsByDay] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: since } }),
      Order.countDocuments({ createdAt: { $gte: since } }),
      Order.aggregate([
        { $match: { status: "completed", createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: "$commissionAmount" }, gross: { $sum: "$price" } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.status(200).json({
      windowDays: days,
      newUsers,
      newOrders,
      commissionRevenue: revenueAgg[0]?.total || 0,
      grossVolume: revenueAgg[0]?.gross || 0,
      ordersByStatus,
      signupsByDay,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Craftsmen: performance leaderboard ==========
const getCraftsmenAnalytics = async (req, res) => {
  try {
    const handymen = await Handyman.find()
      .populate("userId", "name email phone createdAt")
      .sort({ rating: -1, completedOrders: -1 })
      .limit(200)
      .lean();

    const data = handymen.map((h) => ({
      userId: h.userId?._id,
      name: h.userId?.name,
      email: h.userId?.email,
      profession: h.profession,
      rating: h.rating,
      completedOrders: h.completedOrders,
      verified: h.verified,
      isSuspended: h.isSuspended,
      walletBalance: h.walletBalance,
    }));

    res.status(200).json({ data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Jobs: order funnel + profession breakdown ==========
const getJobsAnalytics = async (req, res) => {
  try {
    const [byStatus, byProfession, avgCompletionMs] = await Promise.all([
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: "$profession", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Order.aggregate([
        { $match: { status: "completed" } },
        { $project: { durationMs: { $subtract: ["$updatedAt", "$createdAt"] } } },
        { $group: { _id: null, avg: { $avg: "$durationMs" } } },
      ]),
    ]);

    res.status(200).json({
      byStatus,
      byProfession,
      avgCompletionHours: avgCompletionMs[0]?.avg ? Math.round(avgCompletionMs[0].avg / 3600000) : 0,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Reviews: rating distribution ==========
const getReviewsAnalytics = async (req, res) => {
  try {
    const [distribution, avgAgg, total] = await Promise.all([
      Review.aggregate([{ $group: { _id: "$rating", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Review.aggregate([{ $group: { _id: null, avg: { $avg: "$rating" } } }]),
      Review.countDocuments(),
    ]);

    res.status(200).json({
      distribution,
      averageRating: avgAgg[0]?.avg ? Math.round(avgAgg[0].avg * 100) / 100 : 0,
      total,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== CSV export: users | orders | reviews ==========
const exportCSV = async (req, res) => {
  try {
    const { type } = req.params;
    let rows = [];

    if (type === "users") {
      const users = await User.find().select("-password").lean();
      rows = users.map((u) => ({
        id: u._id, name: u.name, email: u.email, phone: u.phone,
        role: u.role, isBanned: u.isBanned, isVerified: u.isVerified,
        createdAt: u.createdAt,
      }));
    } else if (type === "orders") {
      const orders = await Order.find()
        .populate("customerId", "name email")
        .populate("handymanId", "name email")
        .lean();
      rows = orders.map((o) => ({
        id: o._id, customer: o.customerId?.name, handyman: o.handymanId?.name,
        profession: o.profession, status: o.status, price: o.price,
        commissionAmount: o.commissionAmount, createdAt: o.createdAt,
      }));
    } else if (type === "reviews") {
      const reviews = await Review.find().lean();
      rows = reviews.map((r) => ({
        id: r._id, orderId: r.orderId, rating: r.rating,
        comment: r.comment, createdAt: r.createdAt,
      }));
    } else {
      return res.status(400).json({ msg: "type must be users|orders|reviews" });
    }

    const csv = toCSV(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-export.csv"`);
    res.status(200).send("\uFEFF" + csv); // BOM so Excel renders Arabic correctly
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = {
  getOverviewAnalytics,
  getCraftsmenAnalytics,
  getJobsAnalytics,
  getReviewsAnalytics,
  exportCSV,
};
