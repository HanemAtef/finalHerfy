const stripe = require('../config/stripe');
const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const User = require('../models/User');
const { createNotification } = require('./notificationController');

// POST /api/webhooks/stripe
// Registered with express.raw() in app.js BEFORE express.json()
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;

        // ---- Penalty settlement payment (metadata-routed) ----
        // Independent penalty payments carry metadata.type = 'penalty_settlement'
        if (pi.metadata && pi.metadata.type === 'penalty_settlement') {
          const userId = pi.metadata.userId;
          if (!userId) {
            console.error('[Webhook] penalty_settlement missing userId in metadata');
            break;
          }
          // Atomic + idempotent: only sets to 0 if currently > 0.
          // A duplicate webhook will find penaltyAmount already 0 → no-op.
          const result = await User.findOneAndUpdate(
            { _id: userId, penaltyAmount: { $gt: 0 } },
            { $set: { penaltyAmount: 0 } },
            { returnDocument: 'after' }
          );

          const handymanResult = await Handyman.findOneAndUpdate(
            { userId: userId, penaltyAmount: { $gt: 0 } },
            { $set: { penaltyAmount: 0 } },
            { returnDocument: 'after' }
          );

          if (result || handymanResult) {
            const currentPenaltyCount = result?.penaltyCount || handymanResult?.penaltyCount || 0;
            console.log(`[Webhook] Penalty settled for user ${userId} via Stripe. penaltyCount remains ${currentPenaltyCount}.`);
            await createNotification(
              null, userId, 'payment_confirmed',
              'تم تسوية الغرامة',
              'تم استلام دفعة الغرامة بنجاح عبر البطاقة. يمكنك الآن استخدام المنصة بشكل طبيعي.',
              { penaltyAmount: 0, penaltyCount: currentPenaltyCount }
            );
          } else {
            console.log(`[Webhook] Duplicate penalty settlement for user ${userId} — already settled, skipping.`);
          }
          break;
        }

        // ---- Order payment (existing flow) ----
        // Find the order but DO NOT update yet — check idempotency first.
        const order = await Order.findOne({ stripePaymentIntentId: pi.id });
        if (!order) break;

        // IDEMPOTENCY GUARD (atomic): only one webhook can transition to 'paid'.
        // A duplicate webhook will not match the filter → no-op.
        const updatedOrder = await Order.findOneAndUpdate(
          { _id: order._id, paymentStatus: { $ne: 'paid' } },
          { paymentStatus: 'paid', paidAt: new Date() },
          { new: true }
        );
        if (!updatedOrder) {
          console.log(`[Webhook] Duplicate payment_intent.succeeded for ${pi.id} — order already paid, skipping`);
          break;
        }

        // Settle legacy penalty on the order (new orders have penaltyAmount = 0).
        // Atomic + idempotent: only sets to 0 if currently > 0.
        if (updatedOrder.penaltyAmount > 0) {
          await User.findOneAndUpdate(
            { _id: updatedOrder.customerId, penaltyAmount: { $gt: 0 } },
            { $set: { penaltyAmount: 0 } }
          );
        }

        // Credit the handyman's pending earnings (order price minus commission)
        const net = (updatedOrder.totalPrice || updatedOrder.price || 0) - (updatedOrder.commissionAmount || 0);
        if (net > 0) {
          await Handyman.findOneAndUpdate(
            { userId: updatedOrder.handymanId },
            { $inc: { pendingEarnings: net } }
          );
        }
        await createNotification(
          null, updatedOrder.customerId, 'payment_confirmed',
          'تم الدفع بنجاح',
          'تم استلام دفعتك الإلكترونية بنجاح.',
          { orderId: updatedOrder._id }
        );
        await createNotification(
          null, updatedOrder.handymanId, 'payment_confirmed',
          'تم دفع الطلب إلكترونياً',
          `قام العميل بالدفع إلكترونياً عبر البطاقة — لا حاجة لاستلام كاش. مستحقاتك: ${net} ج.م`,
          { orderId: updatedOrder._id }
        );
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;

        // Penalty payment failure
        if (pi.metadata && pi.metadata.type === 'penalty_settlement') {
          const userId = pi.metadata.userId;
          if (userId) {
            await createNotification(
              null, userId, 'payment_failed',
              'فشل تسوية الغرامة',
              'فشلت عملية الدفع الإلكتروني للغرامة، يرجى المحاولة مرة أخرى.',
              {}
            );
          }
          break;
        }

        const failedOrder = await Order.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { paymentStatus: 'failed' },
          { new: true }
        );
        if (failedOrder) {
          await createNotification(
            null,
            failedOrder.customerId,
            'payment_failed',
            'فشل الدفع',
            'فشلت عملية الدفع الإلكتروني، يرجى المحاولة مرة أخرى.',
            { orderId: failedOrder._id }
          );
          await createNotification(
            null,
            failedOrder.handymanId,
            'payment_failed',
            'فشل دفع الطلب',
            'فشلت محاولة الدفع الإلكتروني من العميل.',
            { orderId: failedOrder._id }
          );
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return res.status(500).send('Internal webhook error');
  }

  res.json({ received: true });
};

module.exports = { handleStripeWebhook };
