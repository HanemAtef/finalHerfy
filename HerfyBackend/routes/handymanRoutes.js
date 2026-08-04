// HerfyBackend/routes/handymanRoutes.js
const express = require("express");
const router = express.Router();

const { authMiddleware, allowedToMiddleware, checkHandymanActive } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validationMiddleware");
const updateValidationSchema = require("../validations/updateValidationSchema");

const {
  getNearbyHandymen,
  getHandymanDetails,
  updateHandymanProfile,
  getHandymanAnalytics,
  toggleAvailability,
  getHandymanStatus,
  getHandymanFullProfile,
  updateAvailability,
  getMonthlyStats,
} = require("../controllers/handymanController");

console.log("✅ Handyman Routes loaded");

// Public
router.get("/nearby", getNearbyHandymen);

// Fixed paths MUST come before /:id
router.get("/status", authMiddleware, allowedToMiddleware("handyman"), getHandymanStatus);
router.get("/profile", authMiddleware, allowedToMiddleware("handyman"), getHandymanFullProfile);
router.get("/monthly-stats", authMiddleware, allowedToMiddleware("handyman"), getMonthlyStats);

// Parameterized
router.get("/:id", getHandymanDetails);

router.put(
  "/:id",
  authMiddleware,
  allowedToMiddleware("handyman"),
  checkHandymanActive,
  validate(updateValidationSchema),
  updateHandymanProfile
);

router.get(
  "/:handymanId/analytics",
  authMiddleware,
  allowedToMiddleware("handyman"),
  checkHandymanActive,
  getHandymanAnalytics
);

router.patch(
  "/:handymanId/availability",
  authMiddleware,
  allowedToMiddleware("handyman"),
  checkHandymanActive,
  toggleAvailability
);

module.exports = router;
