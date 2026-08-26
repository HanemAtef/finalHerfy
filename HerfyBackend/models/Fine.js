const mongoose = require('mongoose');

const fineSchema = new mongoose.Schema(
  {
    handymanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 50,
    },
    reason: {
      type: String,
      default: 'إلغاء متكرر للطلبات',
    },
    status: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'cancelled'],
      default: 'unpaid',
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    settlementRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SettlementRequest',
    },
    paidAt: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ['card'],
      default: 'card',
    },
    transactionId: {
      type: String,
    },
  },
  { timestamps: true }
);

fineSchema.index({ handymanId: 1, status: 1 });
fineSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Fine', fineSchema);
