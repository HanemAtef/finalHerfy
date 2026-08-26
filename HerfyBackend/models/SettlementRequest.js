const mongoose = require('mongoose');

const settlementRequestSchema = new mongoose.Schema(
  {
    handymanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fineIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Fine',
      },
    ],
    amount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'bank_transfer'],
      default: 'cash',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected'],
      default: 'pending',
    },
    notes: {
      type: String,
      default: '',
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    confirmedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

settlementRequestSchema.index({ handymanId: 1, status: 1 });
settlementRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SettlementRequest', settlementRequestSchema);
