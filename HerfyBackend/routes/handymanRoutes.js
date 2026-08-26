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
  getHandymanMonthlyStats,
  toggleAvailability,
  getHandymanStatus,        
  getHandymanFullProfile,  
  updateAvailability,      
} = require("../controllers/handymanController");

// =====================================================
// ========== PUBLIC ROUTES (No auth required) ==========
// =====================================================


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

router.get(
  "/monthly-stats",
  authMiddleware,
  allowedToMiddleware("handyman"),
  checkHandymanActive,
  getHandymanMonthlyStats
);

// Fines & Settlement Requests
const {
  requestFineSettlement,
  getMyFines,
} = require("../controllers/settlementController");

router.get(
  "/fines/my-fines",
  authMiddleware,
  allowedToMiddleware("handyman"),
  getMyFines
);

router.post(
  "/fines/request-settlement",
  authMiddleware,
  allowedToMiddleware("handyman"),
  requestFineSettlement
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
