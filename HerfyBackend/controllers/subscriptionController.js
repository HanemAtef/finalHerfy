const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const StripeSubscription = require("../models/StripeSubscription");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const { SUBSCRIPTION_PLANS } = require("../utils/constants");

// Map plan names to your real Stripe Price IDs (create these in Stripe Dashboard)
const PLANS = {
  monthly: { priceId: process.env.STRIPE_PRICE_MONTHLY, label: "Monthly Plan" },
  yearly:  { priceId: process.env.STRIPE_PRICE_YEARLY,  label: "Yearly Plan"  },
};

// GET /api/handymen/subscription
exports.getSubscription = async (req, res, next) => {
  try {
    if (req.user.role !== "handyman") {
      return res.status(403).json({ message: "Only handymen can view subscription details" });
    }

    const handyman = await Handyman.findOne({ userId: req.user._id });
    if (!handyman) return res.status(404).json({ message: "Handyman profile not found" });

    const subscriptionPlan = handyman.subscriptionPlan || "FREE";
    const planConfig = SUBSCRIPTION_PLANS[subscriptionPlan] || SUBSCRIPTION_PLANS.FREE;
    const activeClients = await Order.countDocuments({
      handymanId: req.user._id,
      status: { $in: ["accepted", "price_confirmed", "scheduled", "in-progress", "arrived"] },
    });

    res.json({
      subscriptionPlan,
      commissionRate: planConfig.commissionRate,
      maxActiveClients: planConfig.maxActiveClients,
      activeClients,
      remainingSlots: Math.max(0, planConfig.maxActiveClients - activeClients),
      price: planConfig.price,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/handymen/:handymanId/subscription
exports.setSubscriptionPlan = async (req, res, next) => {
  try {
    const { subscriptionPlan } = req.body;
    if (!Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS, subscriptionPlan)) {
      return res.status(400).json({ message: "Invalid subscription plan" });
    }

    const handyman = await Handyman.findOneAndUpdate(
      { userId: req.params.handymanId },
      { subscriptionPlan },
      { new: true, runValidators: true }
    );
    if (!handyman) return res.status(404).json({ message: "Handyman profile not found" });

    res.json({ subscriptionPlan: handyman.subscriptionPlan });
  } catch (err) {
    next(err);
  }
};

// POST /api/subscriptions/create
// Body: { userId, plan: "monthly"|"yearly", paymentMethodId }
exports.createSubscription = async (req, res, next) => {
  try {
    const { plan, paymentMethodId } = req.body;
    const userId = req.user._id; // set by authMiddleware
    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ message: "Invalid plan" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Create or reuse Stripe Customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: userId.toString() },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create subscription — expand latest_invoice.payment_intent for clientSecret
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: planConfig.priceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    await StripeSubscription.create({
      user: userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      plan,
      stripePriceId: planConfig.priceId,
      status: subscription.status,
    });

    res.json({
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      subscriptionId: subscription.id,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/subscriptions/cancel
// Body: { subscriptionId }
exports.cancelSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.body;
    await stripe.subscriptions.cancel(subscriptionId);
    await StripeSubscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      { status: "canceled" }
    );
    res.json({ message: "Subscription canceled" });
  } catch (err) {
    next(err);
  }
};
