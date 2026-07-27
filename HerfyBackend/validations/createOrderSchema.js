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
  requestType: Joi.string().valid('instant', 'scheduled').default('instant'),
  scheduledDate: Joi.date().when('requestType', {
    is: 'scheduled',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  estimatedPrice: Joi.number().min(0).optional(),
  customerLocation: Joi.object({
    type: Joi.string().valid('Point').default('Point'),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  isEmergency:Joi.bool().default('false')
});

module.exports = createOrderSchema;