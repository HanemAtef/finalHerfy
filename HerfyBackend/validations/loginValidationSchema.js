// HerfyBackend/validations/loginValidationSchema.js
const Joi = require("joi");

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صحيح',
    'any.required': 'البريد الإلكتروني مطلوب'
  }),
  
  password: Joi.string().required().messages({
    'any.required': 'كلمة المرور مطلوبة'
  }),
  
  location: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2)
  }).optional()
});

module.exports = loginSchema;