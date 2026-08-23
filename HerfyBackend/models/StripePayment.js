const mongoose = require("mongoose");

const stripePaymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [
      {
        productId: String,
        name: String,
        quantity: Number,
        price: Number, // in cents
      },
    ],
    totalAmount: { type: Number, required: true }, // in cents
    stripePaymentIntentId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StripePayment", stripePaymentSchema);
