const express = require("express");
const router = express.Router();
const { createPaymentIntent } = require("../controllers/paymentController");
const { createPenaltyPaymentIntent, verifyPenaltyPaymentIntent } = require("../controllers/penaltyController");
const { authMiddleware, allowedToMiddleware } = require("../middlewares/authMiddleware");

router.post("/create-payment-intent", authMiddleware, createPaymentIntent);

// ========== Penalty settlement via Card ==========
router.post("/penalty/create-intent", authMiddleware, createPenaltyPaymentIntent);
router.post("/penalty/verify-intent", authMiddleware, verifyPenaltyPaymentIntent);

module.exports = router;
