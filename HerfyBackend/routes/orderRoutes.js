const express = require("express");
const router = express.Router();

const { authMiddleware, allowedToMiddleware } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validationMiddleware");
const createOrderSchema = require("../validations/createOrderSchema");
const updateOrderSchema = require("../validations/updateOrderSchema");
const idempotency = require("../middlewares/idempotencyMiddleware");

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
  markOnTheWay,
  confirmCashPayment,
  createStripePaymentIntent,
  selectPaymentMethod,
  startOrder,
  updateLiveLocation,
  getDepartureWindow,
} = require("../controllers/orderController");
const { createReport } = require("../controllers/reportController");

router.use(authMiddleware);

// ========== Customer only ==========
router.post("/create", allowedToMiddleware("customer", "admin"), idempotency, validate(createOrderSchema), createOrder);

// ========== Queries ==========
router.get("/customer/:customerId", allowedToMiddleware("customer", "admin"), getCustomerOrders);
router.get("/handyman/:handymanId", allowedToMiddleware("handyman", "admin"), getHandymanOrders);
router.get("/handyman/:handymanId/pending", getPendingOrders);
router.get("/:id", getOrder);
router.get("/:id/departure-window", getDepartureWindow);

// ========== Status transitions ==========
router.patch("/:id/status", idempotency, validate(updateOrderSchema), updateOrderStatus);
router.post("/:id/start", startOrder);
router.patch("/:id/confirm-price", idempotency, confirmPrice);
router.patch("/:id/on-the-way", markOnTheWay);
router.put("/:id/live-location", updateLiveLocation);

// ========== Payment: method selection (customer chooses cash or card after completion) ==========
router.patch("/:id/select-payment-method", idempotency, selectPaymentMethod);

// ========== Payment: cash (handyman confirms receipt) ==========
router.patch("/:id/confirm-payment", idempotency, confirmCashPayment);

// ========== Payment: card (Stripe PaymentIntent — created only after completion) ==========
router.post("/:id/create-payment-intent", createStripePaymentIntent);

// ========== Other ==========
router.post("/:id/reschedule-request", requestReschedule);
router.post("/:id/reschedule-response", respondReschedule);
router.post("/:orderId/report", createReport);

module.exports = router;
