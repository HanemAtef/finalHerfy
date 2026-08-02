const mongoose = require("mongoose");

const handymanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Was a hardcoded enum — now free text validated at the controller
    // level against the admin-managed ServiceType collection, so new
    // trades can be added without a code deploy. Existing Arabic values
    // already in the DB remain valid.
    profession: {
      type: String,
      required: true,
    },

    bio: {
      type: String,
      default: "",
    },

    price: {
      type: Number,
      required: true,
    },

    experienceYears: {
      type: Number,
      default: 0,
    },

    rating: {
      type: Number,
      default: 0,
    },

    completedOrders: {
      type: Number,
      default: 0,
    },

    verified: {
      type: Boolean,
      default: false,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },

    gallery: [
      {
        type: String,
      },
    ],

    // ===== Wallet / platform commission ledger =====
    // Since payment happens in cash directly between customer and handyman,
    // the platform's cut (order.commissionAmount) isn't collected at the
    // time of the order — it accumulates here as a debt the handyman owes
    // the platform, and is meant to be settled periodically (e.g. an admin
    // marks it paid, or it's deducted from a future payout).
    walletBalance: {
      type: Number,
      default: 0, // positive = amount owed TO the platform
    },

    penaltyAmount: {
      type: Number,
      default: 0,
    },

    monthlyCancellationCount: {
      type: Number,
      default: 0,
    },

    monthlyCancellationMonth: {
      type: Number,
      default: new Date().getMonth(),
    },

    monthlyCancellationYear: {
      type: Number,
      default: new Date().getFullYear(),
    },

    isSuspended: {
      type: Boolean,
      default: false,
    },

    suspendedReason: {
      type: String,
      default: null,
    },

    // Admin verification workflow (approve / reject with a reason)
    rejected: {
      type: Boolean,
      default: false,
    },

    rejectedReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const Handyman = mongoose.model("Handyman", handymanSchema);
module.exports = Handyman;