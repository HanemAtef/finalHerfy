// Reports & dispute resolution: either party on an order can file a report;
// the order flips to "disputed" (chat/actions freeze) until an admin
// resolves it, which either restores the order or keeps it cancelled.
const Report = require("../models/Report");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const Message = require("../models/Message");
const { createNotification } = require("./notificationController");

// ========== Customer/handyman files a report on an order ==========
const createReport = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, description = "" } = req.body;
    if (!reason) return res.status(400).json({ msg: "سبب البلاغ مطلوب" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    const userId = req.user._id.toString();
    const isCustomer = order.customerId.toString() === userId;
    const isHandyman = order.handymanId.toString() === userId;
    if (!isCustomer && !isHandyman) {
      return res.status(403).json({ msg: "غير مصرح لك بالإبلاغ عن هذا الطلب" });
    }

    
    const reportableStatuses = ["accepted", "price_confirmed", "in-progress", "arrived", "completed", "cancelled"];
    if (!reportableStatuses.includes(order.status)) {
      return res.status(400).json({
        msg: "لا يمكن الإبلاغ عن طلب لم يبدأ العمل عليه بعد أو تم إنهاؤه بالفعل",
      });
    }


    const existingOpenReport = await Report.findOne({
      orderId,
      reportedBy: req.user._id,
      status: { $in: ["pending", "reviewing"] },
    });
    if (existingOpenReport) {
      return res.status(400).json({ msg: "لديك بلاغ قيد المراجعة بالفعل على هذا الطلب" });
    }

    const against = isCustomer ? order.handymanId : order.customerId;
    const slaHours = parseInt(process.env.DISPUTE_SLA_HOURS) || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const report = await Report.create({
      orderId,
      reportedBy: req.user._id,
      against,
      reason,
      description,
      slaDeadline,
      orderStatusAtReport: order.status,
    });

    order.status = "disputed";
    await order.save();

    // Admins had no way of knowing a dispute was filed except by manually
    // checking the reports page — notify them directly.
    const io = req.app.get("io");
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    await Promise.all(
      admins.map((admin) =>
        createNotification(
          io,
          admin._id,
          "report_filed",
          "بلاغ جديد",
          `بلاغ جديد على طلب #${orderId.toString().slice(-6)} — السبب: ${reason}`,
          { reportId: report._id, orderId }
        )
      )
    );

    res.status(201).json({ msg: "تم إرسال البلاغ، سيقوم فريق الدعم بمراجعته", data: report });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Admin: list reports (filterable by status) ==========
const getReports = async (req, res) => {
  try {
    const { status, escalated } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (escalated === 'true') filter.isEscalated = true;
    const reports = await Report.find(filter)
      .populate("orderId")
      .populate("reportedBy", "name email phone role")
      .populate("against", "name email phone role")
      .sort({ isEscalated: -1, createdAt: -1 });

    res.status(200).json({ data: reports });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Admin: resolve a report/dispute ==========
// action: "restore" (put the order back to in-progress so both sides can
// continue) or "cancel" (order stays cancelled — e.g. the complaint was
// valid and the job shouldn't continue).
const resolveReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, action } = req.body;
    if (!resolution || !["restore", "cancel"].includes(action)) {
      return res.status(400).json({ msg: "resolution و action (restore|cancel) مطلوبين" });
    }

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    report.status = "resolved";
    report.resolution = resolution;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    await report.save();

    const order = await Order.findById(report.orderId);
    if (order) {
      order.status = action === "restore" ? (report.orderStatusAtReport || "in-progress") : "cancelled";
      await order.save();
    }

    await AuditLog.create({
      adminId: req.user._id,
      action: "report.resolve",
      targetType: "Report",
      targetId: report._id,
      reason: resolution,
      meta: { orderId: report.orderId, orderAction: action },
    });

    const io = req.app.get("io");
    await createNotification(
      io, report.reportedBy, "report_resolved",
      "تم حل البلاغ", resolution, { reportId: report._id }
    );
    await createNotification(
      io, report.against, "report_resolved",
      "تم حل البلاغ", resolution, { reportId: report._id }
    );

    res.status(200).json({ msg: "تم حل البلاغ", data: report });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Current user: reports they filed or reports filed against them ==========
const getMyReports = async (req, res) => {
  try {
    const userId = req.user._id;
    const reports = await Report.find({ $or: [{ reportedBy: userId }, { against: userId }] })
      .populate("orderId")
      .populate("reportedBy", "name email phone role")
      .populate("against", "name email phone role")
      .sort({ createdAt: -1 });

    res.status(200).json({ data: reports });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Admin: full dispute detail (order history + chat + photos) ==========
const getDisputeDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id)
      .populate("orderId")
      .populate("reportedBy", "name email phone role")
      .populate("against", "name email phone role")
      .populate("resolvedBy", "name email");
    if (!report) return res.status(404).json({ msg: "Report not found" });

    const order = report.orderId;
    const orderId = order?._id || report.orderId;

    const [messages, allReports] = await Promise.all([
      Message.find({ orderId }).populate("sender", "name role").sort({ createdAt: 1 }).lean(),
      Report.find({ orderId }).populate("reportedBy", "name role").lean(),
    ]);

    // Collect uploaded photos from order images + completion image
    const photos = [
      ...(order?.images || []),
      ...(order?.completionImage ? [order.completionImage] : []),
    ];

    res.status(200).json({
      report,
      order,
      chatTranscript: messages,
      allReportsOnOrder: allReports,
      photos,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = { createReport, getReports, resolveReport, getMyReports, getDisputeDetail };
