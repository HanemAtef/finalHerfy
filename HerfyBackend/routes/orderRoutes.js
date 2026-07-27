const express = require("express");
const router = express.Router();

const {
  authMiddleware,
  allowedToMiddleware,
} = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validationMiddleware");
const createOrderSchema = require("../validations/createOrderSchema");
const updateOrderSchema = require("../validations/updateOrderSchema");

const {
   createOrder,
  getOrder,
  getCustomerOrders,
  getHandymanOrders,
  updateOrderStatus,
  getPendingOrders,
  confirmPrice,
  respondReschedule,
  requestReschedule,
  confirmCashPayment,
  markOnTheWay,
} = require("../controllers/orderController");
const { createReport } = require("../controllers/reportController");

// All routes require authentication
router.use(authMiddleware);

// ========== Customer only ==========
router.post("/create", validate(createOrderSchema), createOrder);

// ========== Customer, Handyman, or Admin (controller handles) ==========
// NOTE: keep this AFTER the more specific /customer/:id and /handyman/:id
// routes below it — otherwise "/:id" would greedily match paths like
// "/customer/..." is safe here (different segment count), but keeping the
// specific routes first is still the correct, non-fragile ordering.
router.get(
  "/customer/:customerId",
  allowedToMiddleware("customer", "admin"),
  getCustomerOrders,
);

router.get(
  "/handyman/:handymanId",
  allowedToMiddleware("handyman", "admin"),
  getHandymanOrders,
);

router.get("/handyman/:handymanId/pending", getPendingOrders);

router.get("/:id", getOrder);

// ========== Update order status (controller handles permissions) ==========
router.patch("/:id/status", validate(updateOrderSchema), updateOrderStatus);
router.patch("/:id/confirm-price", authMiddleware, confirmPrice);
router.patch("/:id/confirm-payment", authMiddleware, confirmCashPayment);
router.patch("/:id/on-the-way", authMiddleware, markOnTheWay);
router.post("/:id/reschedule-request", authMiddleware, requestReschedule);
router.post("/:id/reschedule-response", authMiddleware, respondReschedule);
router.post("/:orderId/report", authMiddleware, createReport);
module.exports = router;
