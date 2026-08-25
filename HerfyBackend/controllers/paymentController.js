const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const StripePayment = require("../models/StripePayment");

// Hardcoded catalog — replace with DB Product lookups if you add a Product model
const PRODUCT_CATALOG = {
  prod_basic_service: { name: "Basic Service", price: 2999 },   // $29.99
  prod_premium_service: { name: "Premium Service", price: 7999 }, // $79.99
};

// POST /api/payments/create-payment-intent
// Body: { items: [{ productId, quantity }], userId }
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { items } = req.body;
    const userId = req.user._id; // set by authMiddleware
    if (!items?.length) return res.status(400).json({ message: "No items provided" });

    // Always recalculate server-side — never trust frontend prices
    let totalAmount = 0;
    const resolvedItems = items.map(({ productId, quantity = 1 }) => {
      const product = PRODUCT_CATALOG[productId];
      if (!product) throw Object.assign(new Error(`Unknown product: ${productId}`), { statusCode: 400 });
      const lineTotal = product.price * quantity;
      totalAmount += lineTotal;
      return { productId, name: product.name, quantity, price: product.price };
    });

    const idempotencyKey = `pi_${userId}_${items.map(i => i.productId).join("_")}_${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalAmount,
        currency: "usd",
        metadata: { userId: userId?.toString() },
      },
      { idempotencyKey }
    );

    await StripePayment.create({
      user: userId,
      items: resolvedItems,
      totalAmount,
      stripePaymentIntentId: paymentIntent.id,
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    next(err);
  }
};
