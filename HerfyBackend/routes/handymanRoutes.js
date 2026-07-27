const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validationMiddleware");
const updateValidationSchema = require("../validations/updateValidationSchema");

const {
 getNearbyHandymen,
  getHandymanDetails,
  updateHandymanProfile,
  getHandymanAnalytics,
  toggleAvailability,
} = require("../controllers/handymanController");


// Public routes (anyone can access)
console.log("Tracking Page");
router.get("/nearby", getNearbyHandymen);
router.get("/:id", getHandymanDetails);

// Protected route (handyman only or admin)
router.put("/:id", authMiddleware, validate(updateValidationSchema), updateHandymanProfile);
router.get("/:handymanId/analytics", authMiddleware, getHandymanAnalytics);
router.patch("/:handymanId/availability", authMiddleware, toggleAvailability);
module.exports = router;