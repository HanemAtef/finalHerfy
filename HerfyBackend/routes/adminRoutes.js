// HerfyBackend/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const { authMiddleware, allowedToMiddleware } = require("../middlewares/authMiddleware");
const {
  getAdminStats,
  getAllUsers,
  toggleUserBan,
  getAllOrders,
  getPendingVerification,
  autoVerifyHandyman,
  autoVerifyAll,
  getWallets,
  settleWallet,
  getDashboardChart,
  broadcastAnnouncement,
} = require("../controllers/adminControllers");
const {
  approveHandyman,
  rejectHandyman,
  suspendHandyman,
  deleteUserAccount,
  banUserWithReason,
  getAuditLogs,
} = require("../controllers/adminModerationController");
const {
  listCities, createCity, updateCity, deleteCity,
  listServiceTypes, createServiceType, updateServiceType, deleteServiceType,
} = require("../controllers/referenceDataController");
const { getReports, resolveReport, getDisputeDetail } = require("../controllers/reportController");
const {
  getOverviewAnalytics, getCraftsmenAnalytics, getJobsAnalytics, getReviewsAnalytics, exportCSV,
} = require("../controllers/analyticsController");

// =====================================================
// ========== IMPORT NEW REGISTRATION CONTROLLERS ==========
// =====================================================
const {
  getPendingRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest
} = require("../controllers/adminControllers");

// All admin routes require authentication + admin role
router.use(authMiddleware, allowedToMiddleware("admin"));

// =====================================================
// ========== DASHBOARD & STATS ==========
// =====================================================
router.get("/stats", getAdminStats);
router.get("/dashboard/chart", getDashboardChart);

// =====================================================
// ========== USER MANAGEMENT ==========
// =====================================================
router.get("/users", getAllUsers);
router.patch("/users/:userId/ban", toggleUserBan); // legacy, kept for compatibility
router.patch("/users/:userId/ban-with-reason", banUserWithReason);
router.delete("/users/:userId", deleteUserAccount);

// =====================================================
// ========== ORDER MANAGEMENT ==========
// =====================================================
router.get("/orders", getAllOrders);

// =====================================================
// ========== REGISTRATION REQUEST MANAGEMENT (NEW) ==========
// =====================================================
// جلب طلبات التسجيل المعلقة
router.get("/pending-registrations", getPendingRegistrationRequests);

// الموافقة على طلب تسجيل
router.patch("/approve-registration/:handymanId", approveRegistrationRequest);

// رفض طلب تسجيل (مع سبب)
router.patch("/reject-registration/:handymanId", rejectRegistrationRequest);

// =====================================================
// ========== HANDYMAN VERIFICATION (Auto) ==========
// =====================================================
router.get("/handymen/pending-verification", getPendingVerification);
router.patch("/handymen/:handymanId/auto-verify", autoVerifyHandyman);
router.patch("/handymen/auto-verify-all", autoVerifyAll);

// =====================================================
// ========== HANDYMAN MODERATION (Manual) ==========
// =====================================================
router.patch("/handymen/:handymanId/approve", approveHandyman);
router.patch("/handymen/:handymanId/reject", rejectHandyman);
router.patch("/handymen/:handymanId/suspend", suspendHandyman);

// =====================================================
// ========== AUDIT LOG ==========
// =====================================================
router.get("/audit-logs", getAuditLogs);

// =====================================================
// ========== WALLET MANAGEMENT ==========
// =====================================================
router.get("/wallets", getWallets);
router.patch("/wallets/:handymanId/settle", settleWallet);

// =====================================================
// ========== REFERENCE DATA ==========
// =====================================================
router.get("/cities", listCities);
router.post("/cities", createCity);
router.patch("/cities/:id", updateCity);
router.delete("/cities/:id", deleteCity);

router.get("/service-types", listServiceTypes);
router.post("/service-types", createServiceType);
router.patch("/service-types/:id", updateServiceType);
router.delete("/service-types/:id", deleteServiceType);

// =====================================================
// ========== REPORTS & DISPUTES ==========
// =====================================================
router.get("/reports", getReports);
router.get("/reports/:id/detail", getDisputeDetail);
router.patch("/reports/:id/resolve", resolveReport);

// =====================================================
// ========== ANALYTICS ==========
// =====================================================
router.get("/analytics/overview", getOverviewAnalytics);
router.get("/analytics/craftsmen", getCraftsmenAnalytics);
router.get("/analytics/jobs", getJobsAnalytics);
router.get("/analytics/reviews", getReviewsAnalytics);
router.get("/export/:type", exportCSV);

// =====================================================
// ========== ANNOUNCEMENTS ==========
// =====================================================
router.post("/broadcast", broadcastAnnouncement);

module.exports = router;