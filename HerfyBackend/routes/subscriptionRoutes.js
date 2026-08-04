const express = require("express");
const router = express.Router();
const { createSubscription, cancelSubscription } = require("../controllers/subscriptionController");
const { authMiddleware } = require("../middlewares/authMiddleware");

router.post("/create", authMiddleware, createSubscription);
router.post("/cancel", authMiddleware, cancelSubscription);

module.exports = router;
