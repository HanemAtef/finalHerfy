const stripe = require('../config/stripe');
const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const User = require('../models/User');
const StripeSubscription = require('../models/StripeSubscription');
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
        if (pi.metadata && pi.metadata.type === 'penalty_settlement') {
          const userId = pi.metadata.userId;
          if (!userId) {
            console.error('[Webhook] penalty_settlement missing userId in metadata');
            break;
          }
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
        const order = await Order.findOne({ stripePaymentIntentId: pi.id });
        if (!order) break;

        const updatedOrder = await Order.findOneAndUpdate(
          { _id: order._id, paymentStatus: { $ne: 'paid' } },
          { paymentStatus: 'paid', paidAt: new Date() },
          { new: true }
        );
        if (!updatedOrder) {
          console.log(`[Webhook] Duplicate payment_intent.succeeded for ${pi.id} — order already paid, skipping`);
          break;
        }

        if (updatedOrder.penaltyAmount > 0) {
          await User.findOneAndUpdate(
            { _id: updatedOrder.customerId, penaltyAmount: { $gt: 0 } },
            { $set: { penaltyAmount: 0 } }
          );
        }

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

      // ---- Handyman subscription payment succeeded ----
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;

        const subscriptionId =
          invoice.parent?.subscription_details?.subscription || invoice.subscription;

        if (!subscriptionId) break;

        const stripeSubDoc = await StripeSubscription.findOneAndUpdate(
          { stripeSubscriptionId: subscriptionId },
          { status: 'active' },
          { new: true }
        );

        if (!stripeSubDoc) {
          console.log(`[Webhook] No local StripeSubscription found for ${subscriptionId}`);
          break;
        }

        // idempotent: لو الحرفي أصلاً PREMIUM، منعملش تحديث تاني
        const handyman = await Handyman.findOneAndUpdate(
          { userId: stripeSubDoc.user, subscriptionPlan: { $ne: 'PREMIUM' } },
          { subscriptionPlan: 'PREMIUM' },
          { new: true }
        );

        if (handyman) {
          console.log(`[Webhook] Handyman ${stripeSubDoc.user} upgraded to PREMIUM`);
          await createNotification(
            null, stripeSubDoc.user, 'payment_confirmed',
            'تم تفعيل باقتك بنجاح',
            'تم الاشتراك بنجاح، عمولة المنصة وعدد العملاء المتاحين تحدثوا فورًا.',
            { subscriptionPlan: 'PREMIUM' }
          );
        } else {
          console.log(`[Webhook] Duplicate invoice.payment_succeeded for sub ${subscriptionId} — already PREMIUM`);
        }
        break;
      }

      // ---- Handyman subscription canceled/expired ----
      case 'customer.subscription.deleted': {
        const sub = event.data.object;

        const stripeSubDoc = await StripeSubscription.findOneAndUpdate(
          { stripeSubscriptionId: sub.id },
          { status: 'canceled' },
          { new: true }
        );
        if (!stripeSubDoc) break;

        await Handyman.findOneAndUpdate(
          { userId: stripeSubDoc.user },
          { subscriptionPlan: 'FREE' }
        );

        console.log(`[Webhook] Handyman ${stripeSubDoc.user} downgraded to FREE (subscription canceled)`);
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