const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const StripeSubscription = require("../models/StripeSubscription");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const { SUBSCRIPTION_PLANS } = require("../utils/constants");

// خطط الاشتراك المربوطة بـ Stripe Price IDs الحقيقية (من الـ Dashboard، test mode)
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
// Body: { plan: "monthly" | "yearly" }
exports.createSubscription = async (req, res, next) => {
  try {
    const { plan } = req.body;
    const userId = req.user._id;

    const planConfig = PLANS[plan];
    if (!planConfig) {
      return res.status(400).json({ message: "Invalid plan" });
    }
    if (!planConfig.priceId) {
      // بيحمينا لو نسينا نحط الـ Price ID في env
      console.error(`[createSubscription] Missing Stripe Price ID for plan: ${plan}`);
      return res.status(500).json({ message: "Subscription plan is not configured correctly" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.email) {
      return res.status(400).json({ message: "User must have an email to subscribe" });
    }

    // إنشاء أو استخدام Stripe Customer موجود
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

// إنشاء الاشتراك
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: planConfig.priceId }],
  payment_behavior: "default_incomplete",
  payment_settings: {
    save_default_payment_method: "on_subscription",
    payment_method_types: ["card"],
  },
  expand: ["latest_invoice.confirmation_secret"], // ✅ مش latest_invoice.payment_intent
});

// ✅ ناخد الـ client_secret من confirmation_secret مباشرة
const confirmationSecret = subscription.latest_invoice?.confirmation_secret;
if (!confirmationSecret || !confirmationSecret.client_secret) {
  console.error("[createSubscription] No confirmation_secret returned:", subscription.id);
  return res.status(500).json({ message: "Failed to create payment for this subscription" });
}

await StripeSubscription.create({
  user: userId,
  stripeCustomerId: customerId,
  stripeSubscriptionId: subscription.id,
  plan,
  stripePriceId: planConfig.priceId,
  status: subscription.status,
});

res.json({
  clientSecret: confirmationSecret.client_secret,
  subscriptionId: subscription.id,
});
  } catch (err) {
    console.error("[createSubscription] Stripe error:", err.message);
    next(err);
  }
};

// POST /api/subscriptions/cancel
// Body: { subscriptionId }
exports.cancelSubscription = async (req, res, next) => {
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ message: "subscriptionId is required" });
    }

    await stripe.subscriptions.cancel(subscriptionId);
    await StripeSubscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      { status: "canceled" }
    );
    res.json({ message: "Subscription canceled" });
  } catch (err) {
    console.error("[cancelSubscription] Stripe error:", err.message);
    next(err);
  }
};