const Review = require("../models/Review");
const Handyman = require("../models/Handyman");
const User = require("../models/User");
const Order = require("../models/Order");

// Add review
const addReview = async (req, res) => {
  try {
    const { rating, comment, orderId } = req.body;

    // Check for existing order
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    // Check order status
    if (order.status !== "completed") {
      return res.status(400).json({ msg: "You can only review completed orders" });
    }

    // Check customer authorization
    if (order.customerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: "You are not authorized to review this order" });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ customerId: req.user.id, orderId });
    if (existingReview) {
      return res.status(400).json({ msg: "You have already reviewed this order" });
    }

    // Create review
    const review = await Review.create({
      orderId,
      handymanId: order.handymanId,
      customerId: req.user.id,
      rating,
      comment,
    });

    // Update rating and verification status (10+ orders and >4.5 rating)
    const allReviews = await Review.find({ handymanId: order.handymanId });
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0;

    const handymanDoc = await Handyman.findOne({ userId: order.handymanId });
    if (handymanDoc) {
      handymanDoc.rating = avgRating;
      const isVerified = (handymanDoc.completedOrders || 0) >= 10 && avgRating >= 4.5;
      handymanDoc.verified = isVerified;
      await handymanDoc.save();
    }

    res.status(201).json({
      msg: "Review added successfully",
      review,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ msg: "You have already reviewed this order" });
    }
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// Returns the logged-in customer's review for one of their own orders.
const getOrderReview = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).select('customerId');
    if (!order) return res.status(404).json({ msg: 'Order not found' });
    if (order.customerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'You are not authorized to view this review' });
    }

    const review = await Review.findOne({ orderId, customerId: req.user.id });
    res.status(200).json({ review });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

const getHandymanReviews = async (req, res) => {
  try {
    const { handymanId } = req.params;

    const reviews = await Review.find({ handymanId })
      .populate("customerId", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ msg: "all reviews", data: reviews });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

const getCustomersReviews = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (req.user.id !== customerId && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You can only view your own reviews" });
    }
    const reviews = await Review.find({ customerId }).populate("handymanId", "name profession");
    res.status(200).json({ msg: "all reviews", data: reviews });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = { addReview, getOrderReview, getHandymanReviews, getCustomersReviews };
