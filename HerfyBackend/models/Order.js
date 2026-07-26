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

    // BUG FIX: previously set by orderController.createOrder but never
    // declared here, so Mongoose (strict mode) silently dropped both
    // fields on save — any outstanding customer penalty rolled into a new
    // order was lost with no record of it anywhere, and the customer's
    // penalty balance was cleared without the debt ever being persisted
    // or actually collected.
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
      enum: ["pending", "accepted", "price_confirmed", "in-progress", "completed", "cancelled", "disputed"],
      default: "pending",
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
    },

    eta: {
      type: Number,
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
      requestedBy: { type: String, enum: ["customer", "handyman"] },
      newDate: Date,
      status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
      createdAt: Date,
    },

    isEmergency: {
      type: Boolean,
      default: false,
    },

    // Set when the handyman explicitly presses "I'm on my way" — this is
    // what unlocks the live tracking map on the customer's side. Without it
    // the map would show immediately on price confirmation, which is wrong
    // for scheduled orders (the customer would see a map hours/days before
    // the appointment).
    isHandymanOnTheWay: {
      type: Boolean,
      default: false,
    },

    onTheWayAt: {
      type: Date,
      default: null,
    },

    // Proof-of-completion photo uploaded by the handyman
    completionImage: {
      type: String,
      default: null,
    },

    // Payment (cash-on-completion) tracking
    paymentMethod: {
      type: String,
      enum: ["cash"],
      default: "cash",
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);


orderSchema.index({ customerLocation: "2dsphere" });
orderSchema.index({ handymanLiveLocation: "2dsphere" });
orderSchema.index({ customerId: 1 });
orderSchema.index({ handymanId: 1 });
orderSchema.index({ status: 1 });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;