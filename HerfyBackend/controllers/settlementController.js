const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Fine = require('../models/Fine');
const SettlementRequest = require('../models/SettlementRequest');
const FinancialRecord = require('../models/FinancialRecord');
const AuditLog = require('../models/AuditLog');
const { createNotification } = require('./notificationController');

// 1. Handyman: Request Fine Settlement
const requestFineSettlement = async (req, res) => {
  try {
    const handymanId = req.user.id;

    // Check if there is already a pending settlement request
    const existingPending = await SettlementRequest.findOne({
      handymanId,
      status: 'pending',
    });

    if (existingPending) {
      return res.status(400).json({
        msg: 'طلب التسوية قيد المراجعة بالفعل من قبل الإدارة',
        settlementRequest: existingPending,
      });
    }

    // Find unpaid fines for this handyman
    let unpaidFines = await Fine.find({
      handymanId,
      status: { $in: ['unpaid', 'pending'] },
    });

    // Check handyman's penaltyAmount
    const handyman = await Handyman.findOne({ userId: handymanId });
    const user = await User.findById(handymanId);
    const outstandingAmount = Math.max(handyman?.penaltyAmount || 0, user?.penaltyAmount || 0);

    if (outstandingAmount <= 0 && unpaidFines.length === 0) {
      return res.status(400).json({
        msg: 'لا توجد أي غرامات مستحقة للتسوية حالياً',
      });
    }

    // If unpaid fines documents don't exist yet (e.g. legacy penalties), create them
    if (unpaidFines.length === 0 && outstandingAmount > 0) {
      const fineDoc = await Fine.create({
        handymanId,
        amount: outstandingAmount,
        reason: 'غرامة إلغاء طلبات متكررة',
        status: 'unpaid',
      });
      unpaidFines = [fineDoc];
    }

    const totalAmount = unpaidFines.reduce((sum, f) => sum + (f.amount || 0), 0) || outstandingAmount;

    // Create the settlement request
    const settlementRequest = await SettlementRequest.create({
      handymanId,
      fineIds: unpaidFines.map((f) => f._id),
      amount: totalAmount,
      paymentMethod: 'cash',
      status: 'pending',
      notes: req.body.notes || 'طلب تسوية غرامة نقدية',
    });

    // Mark fines as pending settlement
    await Fine.updateMany(
      { _id: { $in: unpaidFines.map((f) => f._id) } },
      { $set: { status: 'pending', settlementRequestId: settlementRequest._id } }
    );

    res.status(201).json({
      msg: 'طلب التسوية قيد المراجعة',
      settlementRequest,
    });
  } catch (error) {
    console.error('Error requesting fine settlement:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// 2. Handyman: Get My Fines & Settlement Status
const getMyFines = async (req, res) => {
  try {
    const handymanId = req.user.id;

    const [fines, pendingRequest, handyman, user] = await Promise.all([
      Fine.find({ handymanId }).sort({ createdAt: -1 }),
      SettlementRequest.findOne({ handymanId, status: 'pending' }).sort({ createdAt: -1 }),
      Handyman.findOne({ userId: handymanId }),
      User.findById(handymanId),
    ]);

    const unpaidFines = fines.filter((f) => f.status === 'unpaid' || f.status === 'pending');
    const calculatedUnpaidAmount = unpaidFines.reduce((acc, f) => acc + (f.amount || 0), 0);
    const outstandingAmount = Math.max(handyman?.penaltyAmount || 0, user?.penaltyAmount || 0, calculatedUnpaidAmount);
    const totalViolationsCount = handyman?.penaltyCount || user?.penaltyCount || fines.length || 0;

    res.status(200).json({
      fines,
      pendingRequest,
      outstandingAmount,
      totalViolationsCount,
      unpaidCount: unpaidFines.length,
      paidCount: fines.filter((f) => f.status === 'paid').length,
    });
  } catch (error) {
    console.error('Error getting fines:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// 3. Admin: Get All Settlement Requests
const getAdminSettlementRequests = async (req, res) => {
  try {
    const requests = await SettlementRequest.find()
      .populate('handymanId', 'name email phone profileImage')
      .populate('fineIds')
      .populate('confirmedBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({ data: requests });
  } catch (error) {
    console.error('Error fetching settlement requests:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// 4. Admin: Confirm Settlement Request
const confirmSettlementRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const settlementRequest = await SettlementRequest.findById(id);
    if (!settlementRequest) {
      return res.status(404).json({ msg: 'طلب التسوية غير موجود' });
    }

    if (settlementRequest.status !== 'pending') {
      return res.status(400).json({ msg: 'الطلب تمت معالجته مسبقاً (' + settlementRequest.status + ')' });
    }

    const paidAt = new Date();

    // 1. Update Settlement Request
    settlementRequest.status = 'confirmed';
    settlementRequest.confirmedBy = adminId;
    settlementRequest.confirmedAt = paidAt;
    await settlementRequest.save();

    // 2. Update linked Fines to paid
    if (settlementRequest.fineIds && settlementRequest.fineIds.length > 0) {
      await Fine.updateMany(
        { _id: { $in: settlementRequest.fineIds } },
        { $set: { status: 'paid', paidAt: paidAt } }
      );
    } else {
      await Fine.updateMany(
        { handymanId: settlementRequest.handymanId, status: { $in: ['unpaid', 'pending'] } },
        { $set: { status: 'paid', paidAt: paidAt, settlementRequestId: settlementRequest._id } }
      );
    }

    // 3. Zero out penalty amount in Handyman and User models, keeping penaltyCount intact!
    await Handyman.findOneAndUpdate(
      { userId: settlementRequest.handymanId },
      { $set: { penaltyAmount: 0 } }
    );
    await User.findByIdAndUpdate(
      settlementRequest.handymanId,
      { $set: { penaltyAmount: 0 } }
    );

    // 4. Create platform financial record
    const financialRecord = await FinancialRecord.create({
      type: 'fine_payment',
      amount: settlementRequest.amount,
      source: 'handyman_fine',
      handymanId: settlementRequest.handymanId,
      fineId: settlementRequest.fineIds?.[0] || null,
      settlementRequestId: settlementRequest._id,
      status: 'completed',
      confirmedBy: adminId,
    });

    // 5. Create AuditLog
    await AuditLog.create({
      adminId,
      action: 'penalty.settle',
      targetType: 'User',
      targetId: settlementRequest.handymanId,
      reason: 'تأكيد استلام تسوية غرامة نقدية بقيمة ' + settlementRequest.amount + ' ج.م',
      meta: {
        settlementRequestId: settlementRequest._id,
        amount: settlementRequest.amount,
        financialRecordId: financialRecord._id,
      },
    });

    // 6. Notify Handyman
    const io = req.app?.get('io');
    await createNotification(
      io,
      settlementRequest.handymanId,
      'payment_confirmed',
      'تم تأكيد تسوية الغرامة بنجاح ✅',
      'تم استلام مبلغ الغرامة (' + settlementRequest.amount + ' ج.م) وتسويتها بالكامل. يمكنك الآن استقبال وقبول الطلبات الجديدة بشكل طبيعي.',
      { penaltyAmount: 0, settlementRequestId: settlementRequest._id }
    );

    res.status(200).json({
      msg: 'تم تأكيد استلام الغرامة وتسويتها بنجاح',
      settlementRequest,
      financialRecord,
    });
  } catch (error) {
    console.error('Error confirming settlement:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// 5. Admin: Reject Settlement Request
const rejectSettlementRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason = 'تم رفض طلب التسوية من قبل الإدارة' } = req.body;

    const settlementRequest = await SettlementRequest.findById(id);
    if (!settlementRequest) {
      return res.status(404).json({ msg: 'طلب التسوية غير موجود' });
    }

    if (settlementRequest.status !== 'pending') {
      return res.status(400).json({ msg: 'الطلب تمت معالجته مسبقاً (' + settlementRequest.status + ')' });
    }

    // 1. Update Settlement Request
    settlementRequest.status = 'rejected';
    settlementRequest.rejectedAt = new Date();
    settlementRequest.rejectionReason = reason;
    await settlementRequest.save();

    // 2. Revert Fines status to unpaid
    if (settlementRequest.fineIds && settlementRequest.fineIds.length > 0) {
      await Fine.updateMany(
        { _id: { $in: settlementRequest.fineIds } },
        { $set: { status: 'unpaid', settlementRequestId: null } }
      );
    }

    // 3. Create AuditLog
    await AuditLog.create({
      adminId,
      action: 'penalty.reject',
      targetType: 'User',
      targetId: settlementRequest.handymanId,
      reason: 'رفض طلب تسوية غرامة: ' + reason,
      meta: {
        settlementRequestId: settlementRequest._id,
        amount: settlementRequest.amount,
      },
    });

    // 4. Notify Handyman
    const io = req.app?.get('io');
    await createNotification(
      io,
      settlementRequest.handymanId,
      'penalty_warning',
      'تم رفض طلب تسوية الغرامة ❌',
      'تم رفض طلب تسوية الغرامة من قبل الإدارة. السبب: ' + reason,
      { settlementRequestId: settlementRequest._id }
    );

    res.status(200).json({
      msg: 'تم رفض طلب التسوية',
      settlementRequest,
    });
  } catch (error) {
    console.error('Error rejecting settlement:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

module.exports = {
  requestFineSettlement,
  getMyFines,
  getAdminSettlementRequests,
  confirmSettlementRequest,
  rejectSettlementRequest,
};
