const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const StripeSubscription = require("../models/StripeSubscription");

// Map plan names to your real Stripe Price IDs (create these in Stripe Dashboard)
const PLANS = {
  monthly: { priceId: process.env.STRIPE_PRICE_MONTHLY, label: "Monthly Plan" },
  yearly:  { priceId: process.env.STRIPE_PRICE_YEARLY,  label: "Yearly Plan"  },
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
