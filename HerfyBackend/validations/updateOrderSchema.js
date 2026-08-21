const Joi = require('joi');

// FIX (Low #1): this enum previously omitted 'price_confirmed' and
// 'disputed', while Order.status (Mongoose) and orderController's own
// validStatuses array both include them — a drifted validation layer.
// Currently harmless (no client-facing flow submits those two values
// through this specific route today) but worth reconciling so the layers
// don't silently diverge further.
const updateOrderSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'accepted', 'price_confirmed', 'in-progress', 'arrived', 'completed', 'cancelled', 'disputed')
    .required()
    .messages({
      'string.empty': 'Status is required',
      'any.only': 'Invalid status value',
      'any.required': 'Status is required',
    }),
  price: Joi.number().min(0).optional(),
  completionImage: Joi.string().uri().optional(),
});

module.exports = updateOrderSchema;