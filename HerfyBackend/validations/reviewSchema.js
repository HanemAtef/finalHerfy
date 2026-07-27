const Joi = require("joi");

const reviewSchema = Joi.object({
  orderId: Joi.string().length(24).hex().required().messages({
    "string.empty": "Order ID is required",
    "string.length": "Invalid order ID format",
  }),
  rating: Joi.number().min(1).max(5).required().messages({
    "number.min": "Rating must be at least 1",
    "number.max": "Rating must be at most 5",
    "any.required": "Rating is required",
  }),
  comment: Joi.string().allow("").optional(),
});

module.exports = reviewSchema;