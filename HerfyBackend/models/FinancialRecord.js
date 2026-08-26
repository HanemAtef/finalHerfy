const mongoose = require('mongoose');

const financialRecordSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['fine_payment', 'commission', 'payout', 'subscription'],
      default: 'fine_payment',
    },
    amount: {
      type: Number,
      required: true,
    },
    source: {
      type: String,
      default: 'handyman_fine',
    },
    handymanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Fine',
    },
    settlementRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SettlementRequest',
    },
    status: {
      type: String,
      enum: ['completed', 'pending', 'cancelled'],
      default: 'completed',
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paymentMethod: {
      type: String,
      default: 'card',
    },
    transactionId: {
      type: String,
    },
  },
  { timestamps: true }
);

financialRecordSchema.index({ createdAt: -1 });
financialRecordSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('FinancialRecord', financialRecordSchema);
