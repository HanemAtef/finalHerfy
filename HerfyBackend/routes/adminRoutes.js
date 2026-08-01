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
const { getReports, resolveReport } = require("../controllers/reportController");
const {
  getOverviewAnalytics, getCraftsmenAnalytics, getJobsAnalytics, getReviewsAnalytics, exportCSV,
} = require("../controllers/analyticsController");

// All admin routes require authentication + admin role
router.use(authMiddleware, allowedToMiddleware("admin"));

//  Dashboard Statistics
router.get("/stats", getAdminStats);

//  User Management
router.get("/users", getAllUsers);
router.patch("/users/:userId/ban", toggleUserBan); // legacy, kept for compatibility
router.patch("/users/:userId/ban-with-reason", banUserWithReason);
router.delete("/users/:userId", deleteUserAccount);

//  Order Management
router.get("/orders", getAllOrders);

//  Auto-Verification (rule-based)
router.get("/handymen/pending-verification", getPendingVerification);
router.patch("/handymen/:handymanId/auto-verify", autoVerifyHandyman);
router.patch("/handymen/auto-verify-all", autoVerifyAll);

//  Manual moderation (approve/reject/suspend with reasons)
router.patch("/handymen/:handymanId/approve", approveHandyman);
router.patch("/handymen/:handymanId/reject", rejectHandyman);
router.patch("/handymen/:handymanId/suspend", suspendHandyman);

//  Audit log
router.get("/audit-logs", getAuditLogs);

//  Wallets (commission owed by handymen on cash orders)
router.get("/wallets", getWallets);
router.patch("/wallets/:handymanId/settle", settleWallet);

//  Reference data (cities / service types)
router.get("/cities", listCities);
router.post("/cities", createCity);
router.patch("/cities/:id", updateCity);
router.delete("/cities/:id", deleteCity);

router.get("/service-types", listServiceTypes);
router.post("/service-types", createServiceType);
router.patch("/service-types/:id", updateServiceType);
router.delete("/service-types/:id", deleteServiceType);

//  Reports / dispute resolution
router.get("/reports", getReports);
router.patch("/reports/:id/resolve", resolveReport);

//  Analytics + CSV export
router.get("/analytics/overview", getOverviewAnalytics);
router.get("/analytics/craftsmen", getCraftsmenAnalytics);
router.get("/analytics/jobs", getJobsAnalytics);
router.get("/analytics/reviews", getReviewsAnalytics);
router.get("/export/:type", exportCSV);

//refactor chart 
router.get("/dashboard/chart", getDashboardChart);

//  Broadcast a general announcement to users
router.post("/broadcast", broadcastAnnouncement);

module.exports = router;
