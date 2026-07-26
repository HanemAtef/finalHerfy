    const Joi = require('joi');
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.empty': 'الاسم مطلوب',
    'string.min': 'الاسم يجب أن يكون 2 أحرف',
    'any.required': 'الاسم مطلوب'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صحيح',
    'string.empty': 'البريد الإلكتروني مطلوب',
    'any.required': 'البريد الإلكتروني مطلوب'
  }),
  password: Joi.string().min(6).max(100).required().messages({
    'string.min': 'كلمة المرور يجب أن  6 أحرف',
    'string.empty': 'كلمة المرور مطلوبة',
    'any.required': 'كلمة المرور مطلوبة'
  }),
  // FIX (H2): Joi previously allowed role: 'admin' here even though the
  // Mongoose enum and the controller's own check both reject it — a drifted
  // validation layer that happened to be caught elsewhere. Now consistent
  // across all three layers.
  role: Joi.string().valid('customer', 'handyman').default('customer'),
location: Joi.alternatives().try(
  Joi.array().items(Joi.number()).length(2),
  Joi.object({
    type: Joi.string().valid('Point').default('Point'),
    coordinates: Joi.array().items(Joi.number()).length(2)
  })
).optional(),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required().messages({
    'string.pattern.base': 'رقم الهاتف غير صحيح',
    'string.empty': 'رقم الهاتف مطلوب',
    'any.required': 'رقم الهاتف مطلوب'
  }),
  profession: Joi.string().when('role', {
    is: 'handyman',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  price: Joi.number().when('role', {
    is: 'handyman',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  experienceYears: Joi.number().optional(),
  bio: Joi.string().optional(),
  gallery: Joi.array().items(Joi.string()).optional()
});


module.exports = registerSchema;