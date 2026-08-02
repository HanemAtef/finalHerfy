const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      // FIX (M2): email was never normalized anywhere — Foo@Example.com and
      // foo@example.com used to be two different accounts against the
      // case-sensitive unique index. `lowercase: true` normalizes on every
      // save; lookups are normalized at the call site (see authController.js).
    },
    phone: {
      // FIX (H7): unique without sparse treats every missing/empty phone as
      // the same "null" value in the index — the first user without a
      // phone would block every subsequent phoneless account with a
      // duplicate-key error. sparse: true excludes docs missing the field
      // from the unique index entirely.
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["customer", "handyman"],
      default: "customer",
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    // FIX (Low #2): coordinates used to be `required: true`, which forced
    // registerUser to default to [0, 0] (a real point in the Gulf of
    // Guinea) whenever a user didn't share their location — silently
    // polluting $near queries like getNearbyHandymen with a phantom
    // "nearby" result. Making it genuinely optional means a user with no
    // location simply has no `location` field, which a 2dsphere $near
    // query correctly excludes rather than misreports as "very far away".
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    // Password-reset OTP (existing flow)
    otp: String,
    otpExpire: Date,

    // Email verification OTP (registration flow)
    isVerified: {
      type: Boolean,
      default: false,
    },
    emailOtp: String,
    emailOtpExpire: Date,
    penaltyCount: {
      type: Number,
      default: 0,
    },
    // NOTE: the controller has always set `customer.penaltyAmount = ...`
    // but this field was never declared on the schema, so Mongoose (strict
    // mode, the default) silently dropped it on every save — the penalty
    // amount was never actually persisted to the database.
    penaltyAmount: {
      type: Number,
      default: 0,
    },
    isPenalized: {
      type: Boolean,
      default: false,
    },
    // Same bug as penaltyAmount above: adminControllers.toggleUserBan has
    // always set `user.isBanned = ...` and saved it, but without this field
    // declared on the schema Mongoose silently dropped it — banning a user
    // from the admin panel had no real effect.
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: {
      type: String,
      default: null,
    },
    // FIX (M4): admin account deletion used to hard-delete the User row,
    // leaving Order/Message/Review/Notification documents pointing at a
    // now-nonexistent user (populate() silently returns null for that
    // field, permanently losing which party was involved). Soft-deleting
    // instead keeps history intact; deletedAt also blocks login everywhere
    // isBanned is already checked.
    deletedAt: {
      type: Date,
      default: null,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    // References ServiceType/City by their stable `key`/name so the admin
    // can manage the list without touching user records.
    city: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

userSchema.index({ location: "2dsphere" });
userSchema.index({ role: 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = async function (matchedPassword) {
  return bcrypt.compare(matchedPassword, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
