const mongoose = require('mongoose');

const payoutHistorySchema = new mongoose.Schema(
  {
    handymanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Handyman',
      required: true,
    },
    amount: { type: Number, required: true },
    // Admin who processed the payout
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

payoutHistorySchema.index({ handymanId: 1 });

module.exports = mongoose.model('PayoutHistory', payoutHistorySchema);
