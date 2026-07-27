    const mongoose = require("mongoose");

    const reviewSchema = new mongoose.Schema(
    {
        orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        },
        handymanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        },
        customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        },
        rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
        },
        comment: {
        type: String,
        default: "",
        },
    },
    { timestamps: true },
    );
    reviewSchema.index({ handymanId: 1 });
    reviewSchema.index({ customerId: 1 });
    reviewSchema.index({ orderId: 1 });

    const Review = mongoose.model("Review", reviewSchema);
    module.exports = Review;
