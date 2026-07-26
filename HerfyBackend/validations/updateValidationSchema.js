const Joi = require('joi');

const updateValidationSchema = Joi.object({
  price: Joi.number().min(0).optional(),
  bio: Joi.string().max(500).optional(),
  gallery: Joi.array().items(Joi.string()).optional(),
  isAvailable: Joi.boolean().optional(),
});

module.exports = updateValidationSchema;