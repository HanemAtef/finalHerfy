const Joi = require('joi');

const createOrderSchema = Joi.object({
  handymanId: Joi.string().length(24).hex().required().messages({
    'string.empty': 'Handyman ID is required',
    'string.length': 'Invalid handyman ID format',
    'any.required': 'Handyman ID is required',
  }),
  profession: Joi.string().required().messages({
    'string.empty': 'Profession is required',
    'any.required': 'Profession is required',
  }),
  description: Joi.string().optional().allow(''),
  images: Joi.array().items(Joi.string()).optional(),
  scheduledDate: Joi.date().iso().optional().allow(null),
  expectedDuration: Joi.number().min(0.5).max(24).optional().allow(null),
  estimatedPrice: Joi.number().min(0).optional(),
  customerLocation: Joi.object({
    type: Joi.string().valid('Point').default('Point'),
    coordinates: Joi.array()
      .ordered(
        Joi.number().min(-180).max(180).required(), // longitude
        Joi.number().min(-90).max(90).required()    // latitude
      )
      .length(2)
      .optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    address: Joi.string().optional().allow('', null),
    city: Joi.string().optional().allow('', null),
    area: Joi.string().optional().allow('', null),
  }).optional(),
  orderLocation: Joi.object({
    type: Joi.string().valid('Point').default('Point'),
    coordinates: Joi.array()
      .ordered(
        Joi.number().min(-180).max(180).required(), // longitude
        Joi.number().min(-90).max(90).required()    // latitude
      )
      .length(2)
      .optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    address: Joi.string().optional().allow('', null),
    city: Joi.string().optional().allow('', null),
    area: Joi.string().optional().allow('', null),
  }).optional(),
  isEmergency: Joi.bool().default(false),
}).or('customerLocation', 'orderLocation');

module.exports = createOrderSchema;