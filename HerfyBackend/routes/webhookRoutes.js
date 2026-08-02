const express = require("express");
const router = express.Router();
const { handleWebhook } = require("../controllers/webhookController");

// MUST use raw body — Stripe signature verification requires it
router.post("/stripe", express.raw({ type: "application/json" }), handleWebhook);

module.exports = router;
