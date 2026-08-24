// controllers/penaltyController.js
// Independent penalty settlement endpoints (Option A).
// Allows a customer to settle an outstanding penalty without creating an order.

const User = require('../models/User');
const stripe = require('../config/stripe');

// ========== Create Stripe Payment Intent for Penalty Settlement ==========
// POST /api/payments/penalty/create-intent
// Customer-initiated. Creates a Stripe PaymentIntent for the current
// outstanding penaltyAmount. Settlement happens in the Stripe webhook
// (payment_intent.succeeded with metadata.type = 'penalty_settlement').
const createPenaltyPaymentIntent = async (req, res) => {
  try {
    const customer = await User.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ msg: 'Customer not found' });
    }

    if (!customer.penaltyAmount || customer.penaltyAmount <= 0) {
      return res.status(400).json({ msg: 'You have no outstanding penalty to settle' });
    }

    const amountInCents = Math.round(customer.penaltyAmount * 100);
    if (amountInCents <= 0) {
      return res.status(400).json({ msg: 'Penalty amount is too small to charge' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'egp',
      metadata: {
        type: 'penalty_settlement',
        userId: customer._id.toString(),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      penaltyAmount: customer.penaltyAmount,
      penaltyCount: customer.penaltyCount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

// ========== Admin Confirms Cash Settlement for Penalty ==========
// PATCH /api/payments/penalty/confirm-cash
// Admin-only. Body: { customerId }
// Atomically sets customer.penaltyAmount = 0 if currently > 0.
// Idempotent: if already 0, returns current state without error.
const confirmPenaltyCashSettlement = async (req, res) => {
  try {
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ msg: 'customerId is required' });
    }

    // Atomic + idempotent: only sets to 0 if currently > 0.
    const result = await User.findOneAndUpdate(
      { _id: customerId, penaltyAmount: { $gt: 0 } },
      { $set: { penaltyAmount: 0 } },
      { new: true }
    );

    if (!result) {
      // Either not found or already settled — check which
      const user = await User.findById(customerId);
      if (!user) {
        return res.status(404).json({ msg: 'Customer not found' });
      }
      // Already settled — return current state (idempotent)
      return res.json({
        msg: 'Penalty already settled',
        penaltyAmount: user.penaltyAmount,
        penaltyCount: user.penaltyCount,
      });
    }

    res.json({
      msg: 'Penalty settled via cash',
      penaltyAmount: result.penaltyAmount,
      penaltyCount: result.penaltyCount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

module.exports = {
  createPenaltyPaymentIntent,
  confirmPenaltyCashSettlement,
};
