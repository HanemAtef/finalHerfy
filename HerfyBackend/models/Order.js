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

    scheduledDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    scheduledTime: {
      type: String,
      default: "",
    },

    expectedDuration: {
      type: Number,
      default: null,
      min: 0.5,
      max: 24,
    },

    expectedEndTime: {
      type: Date,
    },

    estimatedPrice: {
      type: Number,
    },

    serviceAmount: {
      type: Number,
      default: 0,
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
        "scheduled",
        "price_confirmed",
        "on_the_way",
        "on-the-way",
        "in-progress",
        "in_progress",
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

    // Immutable service location snapshot at order creation time
    orderLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
      address: {
        type: String,
        default: "",
      },
      city: {
        type: String,
        default: "",
      },
      area: {
        type: String,
        default: "",
      },
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
      address: {
        type: String,
        default: "",
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

    liveTracking: {
      isActive: {
        type: Boolean,
        default: false,
      },
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      heading: {
        type: Number,
        default: null,
      },
      speed: {
        type: Number,
        default: null,
      },
      accuracy: {
        type: Number,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
      timestamp: {
        type: Date,
        default: null,
      },
    },

    tripStartedAt: {
      type: Date,
      default: null,
    },

    tripStartLatitude: {
      type: Number,
      default: null,
    },

    tripStartLongitude: {
      type: Number,
      default: null,
    },

    arrivedAt: {
      type: Date,
      default: null,
    },

    arrivalLatitude: {
      type: Number,
      default: null,
    },

    arrivalLongitude: {
      type: Number,
      default: null,
    },

    arrivalDistance: {
      type: Number, // In meters from orderLocation
      default: null,
    },

    arrivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
      oldDate: Date,
      oldTime: String,
      newDate: Date,
      newTime: String,
      reason: String,
      newDuration: Number,
      status: {
        type: String,
        enum: ["pending", "accepted", "approved", "rejected", "cancelled", "expired"],
      },
      createdAt: {
        type: Date,
      },
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rejectedAt: Date,
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rejectionReason: String,
    },

    rescheduleHistory: [
      {
        requestedBy: {
          type: String,
          enum: ["customer", "handyman"],
        },
        oldDate: Date,
        oldTime: String,
        newDate: Date,
        newTime: String,
        reason: String,
        status: {
          type: String,
          enum: ["pending", "approved", "accepted", "rejected", "cancelled", "expired"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        approvedAt: Date,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionReason: String,
      },
    ],

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

    // Execution start geo-fencing metadata
    executionStartedAt: {
      type: Date,
      default: null,
    },

    executionStartLatitude: {
      type: Number,
      default: null,
    },

    executionStartLongitude: {
      type: Number,
      default: null,
    },

    executionStartDistance: {
      type: Number, // Distance in meters from orderLocation
      default: null,
    },

    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    completionImage: {
      type: String,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "card"],
      default: null,
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

    cancellationReason: {
      type: String,
      default: null,
    },

    cancelledBy: {
      type: String,
      enum: ["customer", "handyman", "admin", null],
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.pre("validate", function (next) {
  if (!this.scheduledDate) {
    this.scheduledDate = new Date();
  }
  if (this.scheduledDate && this.expectedDuration) {
    const durationHours = Number(this.expectedDuration);
    this.expectedEndTime = new Date(new Date(this.scheduledDate).getTime() + durationHours * 60 * 60 * 1000);
  }
  if (this.orderLocation?.coordinates && (!this.customerLocation || !this.customerLocation.coordinates)) {
    this.customerLocation = {
      type: "Point",
      coordinates: this.orderLocation.coordinates,
      address: this.orderLocation.address || "",
    };
  } else if (this.customerLocation?.coordinates && (!this.orderLocation || !this.orderLocation.coordinates)) {
    this.orderLocation = {
      type: "Point",
      coordinates: this.customerLocation.coordinates,
      latitude: this.customerLocation.coordinates[1],
      longitude: this.customerLocation.coordinates[0],
      address: this.customerLocation.address || "",
    };
  }
  if (typeof next === "function") next();
});

orderSchema.index({ orderLocation: "2dsphere" });
orderSchema.index({ customerLocation: "2dsphere" });
orderSchema.index({ handymanLiveLocation: "2dsphere" });
orderSchema.index({ customerId: 1 });
orderSchema.index({ handymanId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ trackingStatus: 1 });
orderSchema.index({ handymanId: 1, status: 1, scheduledDate: 1 });

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;