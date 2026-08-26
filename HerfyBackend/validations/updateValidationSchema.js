// HerfyBackend/validations/updateValidationSchema.js
const Joi = require('joi');

const updateValidationSchema = Joi.object({
  price: Joi.number().min(0).optional(),
  bio: Joi.string().max(500).optional().allow('', null),
  gallery: Joi.array().items(Joi.string()).optional(),
  isAvailable: Joi.boolean().optional(),
  address: Joi.string().max(300).optional().allow('', null),
  city: Joi.string().max(100).optional().allow('', null),
  area: Joi.string().max(100).optional().allow('', null),
  location: Joi.object({
    type: Joi.string().valid('Point').default('Point'),
    coordinates: Joi.array()
      .ordered(
        Joi.number().min(-180).max(180).required(), // longitude
        Joi.number().min(-90).max(90).required()    // latitude
      )
      .length(2)
      .required(),
    address: Joi.string().optional().allow('', null),
  }).optional().allow(null),
});

module.exports = updateValidationSchema;