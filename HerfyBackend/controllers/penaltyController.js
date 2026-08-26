const User = require('../models/User');
const Handyman = require('../models/Handyman');
const Fine = require('../models/Fine');
const FinancialRecord = require('../models/FinancialRecord');
const AuditLog = require('../models/AuditLog');
const stripe = require('../config/stripe');
const { createNotification } = require('./notificationController');

// ========== Create Stripe Payment Intent for Penalty Settlement ==========
// POST /api/payments/penalty/create-intent
const createPenaltyPaymentIntent = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    let penaltyAmount = user.penaltyAmount || 0;
    let penaltyCount = user.penaltyCount || 0;

    const handyman = await Handyman.findOne({ userId: req.user.id });
    if (handyman && (handyman.penaltyAmount || 0) > penaltyAmount) {
      penaltyAmount = handyman.penaltyAmount;
      penaltyCount = handyman.penaltyCount || Math.floor(penaltyAmount / 50);
    }

    // Also check unpaid fines in Fine collection
    const unpaidFines = await Fine.find({
      handymanId: req.user.id,
      status: { $in: ['unpaid', 'pending'] },
    });
    if (unpaidFines.length > 0) {
      const fineSum = unpaidFines.reduce((sum, f) => sum + (f.amount || 0), 0);
      if (fineSum > penaltyAmount) {
        penaltyAmount = fineSum;
      }
    }

    if (!penaltyAmount || penaltyAmount <= 0) {
      return res.status(400).json({ msg: 'لا توجد أي غرامات مستحقة للدفع حالياً' });
    }

    const amountInCents = Math.round(penaltyAmount * 100);
    if (amountInCents <= 0) {
      return res.status(400).json({ msg: 'قيمة الغرامة غير صالحة' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'egp',
      metadata: {
        type: 'penalty_settlement',
        userId: user._id.toString(),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      penaltyAmount,
      penaltyCount,
    });
  } catch (error) {
    console.log('Error creating penalty payment intent:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== Verify Stripe Payment & Settle Penalty ==========
// POST /api/payments/penalty/verify-intent
const verifyPenaltyPaymentIntent = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId) {
      return res.status(400).json({ msg: 'paymentIntentId is required' });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi || pi.status !== 'succeeded') {
      return res.status(400).json({ msg: 'لم تكتمل عملية الدفع بعد', status: pi?.status });
    }

    if (pi.metadata?.userId !== userId.toString() || pi.metadata?.type !== 'penalty_settlement') {
      return res.status(403).json({ msg: 'Unauthorized payment intent' });
    }

    const paidAt = new Date();
    const amount = pi.amount / 100;

    // 1. Settle Fines
    await Fine.updateMany(
      { handymanId: userId, status: { $in: ['unpaid', 'pending'] } },
      { $set: { status: 'paid', paidAt, paymentMethod: 'card', transactionId: pi.id } }
    );

    // 2. Clear penaltyAmount on User and Handyman, keeping penaltyCount intact
    const user = await User.findOneAndUpdate(
      { _id: userId },
      { $set: { penaltyAmount: 0 } },
      { returnDocument: 'after' }
    );

    const handyman = await Handyman.findOneAndUpdate(
      { userId: userId },
      { $set: { penaltyAmount: 0 } },
      { returnDocument: 'after' }
    );

    // 3. Create platform FinancialRecord if not already created for this transaction
    let financialRecord = await FinancialRecord.findOne({ transactionId: pi.id });
    if (!financialRecord) {
      financialRecord = await FinancialRecord.create({
        type: 'fine_payment',
        amount,
        source: 'handyman_fine',
        handymanId: userId,
        status: 'completed',
        paymentMethod: 'card',
        transactionId: pi.id,
      });
    }

    // 4. Create Audit Log
    await AuditLog.create({
      action: 'penalty.settle',
      targetType: 'User',
      targetId: userId,
      reason: 'سداد غرامة إلكترونياً عبر البطاقة (Stripe)',
      meta: {
        amount,
        transactionId: pi.id,
        financialRecordId: financialRecord._id,
      },
    });

    // 5. Send Notification
    const io = req.app?.get('io');
    await createNotification(
      io,
      userId,
      'payment_confirmed',
      'تم سداد الغرامة بنجاح ✅',
      `تم استلام دفعة الغرامة (${amount} ج.م) عبر البطاقة البنكية وتصفير رصيد الغرامات. يمكنك الآن قبول واستقبال الطلبات الجديدة.`,
      { penaltyAmount: 0, penaltyCount: handyman?.penaltyCount || user?.penaltyCount || 0 }
    );

    res.status(200).json({
      success: true,
      msg: 'تم سداد الغرامة بالبطاقة بنجاح',
      penaltyAmount: 0,
      penaltyCount: handyman?.penaltyCount || user?.penaltyCount || 0,
      financialRecord,
    });
  } catch (error) {
    console.error('Error verifying penalty payment:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

module.exports = {
  createPenaltyPaymentIntent,
  verifyPenaltyPaymentIntent,
};
