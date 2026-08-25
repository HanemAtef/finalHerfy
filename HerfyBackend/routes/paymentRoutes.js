const express = require("express");
const router = express.Router();
const { createPaymentIntent } = require("../controllers/paymentController");
const { createPenaltyPaymentIntent, confirmPenaltyCashSettlement } = require("../controllers/penaltyController");
const { authMiddleware, allowedToMiddleware } = require("../middlewares/authMiddleware");

router.post("/create-payment-intent", authMiddleware, createPaymentIntent);

// ========== Penalty settlement (independent of orders) ==========
// Customer initiates Stripe payment for outstanding penalty
router.post("/penalty/create-intent", authMiddleware, createPenaltyPaymentIntent);

// Admin confirms cash was received for penalty settlement
router.patch("/penalty/confirm-cash", authMiddleware, allowedToMiddleware("admin"), confirmPenaltyCashSettlement);

module.exports = router;
