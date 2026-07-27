const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validationMiddleware");
const reviewSchema = require("../validations/reviewSchema");

const {
  addReview,
  getHandymanReviews,
  getCustomersReviews,
} = require("../controllers/reviewController");

router.use(authMiddleware);

router.post("/addreview", validate(reviewSchema), addReview);
router.get("/handyman/:handymanId", getHandymanReviews);
router.get("/customer/:customerId", getCustomersReviews);

module.exports = router;