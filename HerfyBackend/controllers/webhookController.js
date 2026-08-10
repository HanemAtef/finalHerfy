const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const StripePayment = require("../models/StripePayment");
const StripeSubscription = require("../models/StripeSubscription");

// POST /api/webhooks/stripe  (raw body — registered before express.json())
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await StripePayment.findOneAndUpdate(
          { stripePaymentIntentId: event.data.object.id },
          { status: "paid" }
        );
        break;

      case "payment_intent.payment_failed":
        await StripePayment.findOneAndUpdate(
          { stripePaymentIntentId: event.data.object.id },
          { status: "failed" }
        );
        break;

      case "customer.subscription.updated":
        await StripeSubscription.findOneAndUpdate(
          { stripeSubscriptionId: event.data.object.id },
          { status: event.data.object.status }
        );
        break;

      case "customer.subscription.deleted":
        await StripeSubscription.findOneAndUpdate(
          { stripeSubscriptionId: event.data.object.id },
          { status: "canceled" }
        );
        break;

      case "invoice.payment_failed": {
        const subId = event.data.object.subscription;
        if (subId) {
          await StripeSubscription.findOneAndUpdate(
            { stripeSubscriptionId: subId },
            { status: "past_due" }
          );
        }
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err.message);
    return res.status(500).send("Internal webhook error");
  }

  res.json({ received: true });
};
