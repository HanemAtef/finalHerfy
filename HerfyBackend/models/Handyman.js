// HerfyBackend/models/Handyman.js
const mongoose = require("mongoose");

const handymanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

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

    totalOffers: {
      type: Number,
      default: 0,
    },

    acceptedOffers: {
      type: Number,
      default: 0,
    },

    acceptanceRate: {
      type: Number,
      default: 1.0, // defaults to 100%
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

    walletBalance: {
      type: Number,
      default: 0,
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

    // Temporary suspension from exceeding monthly cancellation limit.
    isSuspendedPendingReview: {
      type: Boolean,
      default: false,
    },

    suspendedPendingReviewReason: {
      type: String,
      default: null,
    },

    // ** إضافة حقول التسجيل والموافقة **
    registrationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },

    adminNote: {
      type: String,
      default: ''
    },

    registeredAt: {
      type: Date,
      default: Date.now
    },

    approvedAt: {
      type: Date
    },

    rejectedAt: {
      type: Date
    },

    // ** إضافة الملفات المرفقة **
    nationalId: {
      type: String, // مسار الصورة
      required: function() {
        return this.registrationStatus === 'pending';
      }
    },

    certificate: {
      type: String // مسار الصورة
    },

    profileImage: {
      type: String
    },

    // ** إضافة الموقع **
    location: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: {
        type: [Number],
        required: false
      }
    },

    address: {
      type: String
    },

    // ** حقل للـ rejected القديم (للتوافق مع الكود الموجود) **
    rejected: {
      type: Boolean,
      default: false
    },

    rejectedReason: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

// إضافة index للموقع
handymanSchema.index({ location: '2dsphere' });

const Handyman = mongoose.model("Handyman", handymanSchema);
module.exports = Handyman;