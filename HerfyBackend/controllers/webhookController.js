const stripe = require('../config/stripe');
const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
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
        const order = await Order.findOneAndUpdate(
          { stripePaymentIntentId: pi.id },
          { paymentStatus: 'paid', paidAt: new Date() },
          { new: true }
        );
        if (order) {
          // Credit the handyman's pending earnings (order price minus commission)
          const net = (order.totalPrice || order.price || 0) - (order.commissionAmount || 0);
          if (net > 0) {
            await Handyman.findOneAndUpdate(
              { userId: order.handymanId },
              { $inc: { pendingEarnings: net } }
            );
          }
          await createNotification(
            null, order.customerId, 'payment_confirmed',
            'تم الدفع بنجاح',
            'تم استلام دفعتك الإلكترونية بنجاح.',
            { orderId: order._id }
          );
          await createNotification(
            null, order.handymanId, 'payment_confirmed',
            'تم دفع الطلب إلكترونياً',
            `قام العميل بالدفع إلكترونياً عبر البطاقة — لا حاجة لاستلام كاش. مستحقاتك: ${net} ج.م`,
            { orderId: order._id }
          );
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
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
