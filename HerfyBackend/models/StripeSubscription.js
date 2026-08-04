const mongoose = require("mongoose");

const stripeSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    stripeCustomerId: { type: String, required: true },
    stripeSubscriptionId: { type: String, required: true, unique: true },
    plan: { type: String, required: true }, // e.g. "monthly" | "yearly"
    stripePriceId: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "canceled", "past_due", "incomplete"],
      default: "incomplete",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StripeSubscription", stripeSubscriptionSchema);
