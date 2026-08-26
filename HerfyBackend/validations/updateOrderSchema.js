const Joi = require('joi');

// FIX (Low #1): this enum previously omitted 'price_confirmed' and
// 'disputed', while Order.status (Mongoose) and orderController's own
// validStatuses array both include them — a drifted validation layer.
// Currently harmless (no client-facing flow submits those two values
// through this specific route today) but worth reconciling so the layers
// don't silently diverge further.
const updateOrderSchema = Joi.object({
  status: Joi.string()
    .valid(
      'pending',
      'accepted',
      'scheduled',
      'price_confirmed',
      'on_the_way',
      'on-the-way',
      'in-progress',
      'in_progress',
      'arrived',
      'completed',
      'cancelled',
      'disputed',
      'PENDING',
      'ACCEPTED',
      'SCHEDULED',
      'PRICE_CONFIRMED',
      'ON_THE_WAY',
      'IN_PROGRESS',
      'ARRIVED',
      'COMPLETED',
      'CANCELLED',
      'DISPUTED'
    )
    .required()
    .messages({
      'string.empty': 'Status is required',
      'any.only': 'Invalid status value',
      'any.required': 'Status is required',
    }),
  price: Joi.number().min(0).optional(),
  expectedDuration: Joi.number().min(0.5).max(24).optional(),
  completionImage: Joi.string().uri().optional().allow('', null),
  reason: Joi.string().optional().allow(''),
  cancellationReason: Joi.string().optional().allow(''),
  note: Joi.string().optional().allow(''),
  handymanLocation: Joi.object({
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    coordinates: Joi.array().items(Joi.number()).optional(),
  }).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  coordinates: Joi.array().items(Joi.number()).optional(),
  distance: Joi.number().optional(),
  isNearCustomer: Joi.boolean().optional(),
});

module.exports = updateOrderSchema;