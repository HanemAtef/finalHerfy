const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    handymanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    profession: {
      type: String,
      required: true,
    },

    description: {
      type: String,
    },

    images: [
      {
        type: String,
      },
    ],

    requestType: {
      type: String,
      enum: ["instant", "scheduled"],
      default: "instant",
    },

    scheduledDate: {
      type: Date,
    },

    estimatedPrice: {
      type: Number,
    },

    penaltyAmount: {
      type: Number,
      default: 0,
    },

    totalPrice: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "price_confirmed",
        "in-progress",
        "arrived",
        "completed",
        "cancelled",
        "disputed",
      ],
      default: "pending",
    },

    trackingStatus: {
      type: String,
      enum: ["stopped", "active", "expired"],
      default: "stopped",
    },

    trackingStartedAt: {
      type: Date,
      default: null,
    },

    trackingExpiresAt: {
      type: Date,
      default: null,
    },

    price: {
      type: Number,
      default: null,
    },

    customerLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },

    // Live handyman location
    handymanLiveLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },

    eta: {
      type: Number,
      default: null,
    },

    distanceRemaining: {
      type: Number,
      default: null,
    },

    trafficDelay: {
      type: Number,
      default: null,
    },

    arrivalTime: {
      type: Date,
      default: null,
    },

    commissionRate: {
      type: Number,
      default: 10,
    },

    commissionAmount: {
      type: Number,
      default: 0,
    },

    netAmount: {
      type: Number,
      default: 0,
    },

    rescheduleRequest: {
      requestedBy: {
        type: String,
        enum: ["customer", "handyman"],
      },
      newDate: Date,
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending",
      },
      createdAt: Date,
    },

    isEmergency: {
      type: Boolean,
      default: false,
    },

    isHandymanOnTheWay: {
      type: Boolean,
      default: false,
    },

    onTheWayAt: {
      type: Date,
      default: null,
    },

    completionImage: {
      type: String,
      default: null,
    },

    // Payment
    paymentMethod: {
      type: String,
      enum: ["cash", "card"],
      default: "cash",
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending", "paid", "failed", "refunded"],
      default: "unpaid",
    },

    stripePaymentIntentId: {
      type: String,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ customerLocation: "2dsphere" });
orderSchema.index({ handymanLiveLocation: "2dsphere" });
orderSchema.index({ customerId: 1 });
orderSchema.index({ handymanId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ trackingStatus: 1 });

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;