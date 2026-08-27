const express = require('express');
const router = express.Router();
const { handleStripeWebhook } = require('../controllers/webhookController');

// express.raw() is required — Stripe signature verification needs the raw body
router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;