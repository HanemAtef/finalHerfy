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
  getHandymanStatus,        // ✅ تأكد من استيرادها
  getHandymanFullProfile,   // ✅ تأكد من استيرادها
  updateAvailability,       // ✅ تأكد من استيرادها
} = require("../controllers/handymanController");

// =====================================================
// ========== PUBLIC ROUTES (No auth required) ==========
// =====================================================

console.log("✅ Handyman Routes loaded");

router.get("/nearby", getNearbyHandymen);

// =====================================================
// ========== PROTECTED ROUTES (Auth required) ==========
// =====================================================

// ✅ IMPORTANT: Add status route BEFORE the /:id route
// because Express matches routes in order
router.get(
  "/status",
  authMiddleware,
  allowedToMiddleware("handyman"),
  getHandymanStatus
);

router.get(
  "/profile",
  authMiddleware,
  allowedToMiddleware("handyman"),
  checkHandymanActive,
  getHandymanFullProfile
);

// Keep parameterized routes after fixed paths; otherwise `/status` is
// interpreted as an id and never reaches the status controller.
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
