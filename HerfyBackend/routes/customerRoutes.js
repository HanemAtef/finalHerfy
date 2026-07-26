const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authMiddleware");
const { getCustomerStats } = require("../controllers/customerController");

router.get("/:customerId/stats", authMiddleware, getCustomerStats);

module.exports = router;