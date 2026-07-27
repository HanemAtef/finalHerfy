// Lets a customer or handyman see the status of reports they filed or that
// were filed against them — filing itself happens via POST /orders/:id/report,
// admin resolution via /admin/reports (see adminRoutes.js).
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authMiddleware");
const { createReport, getReports, resolveReport, getMyReports  } = require("../controllers/reportController");

router.get("/mine", authMiddleware, getMyReports);
router.get("/", authMiddleware, getReports);
router.patch("/resolve/:id", authMiddleware, resolveReport);
module.exports = router;
