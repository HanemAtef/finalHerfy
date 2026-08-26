// HerfyBackend/validations/registerValidationSchema.js
const Joi = require("joi");

const registerSchema = Joi.object({
  // Basic user fields
  email: Joi.string().email().required().messages({
    "string.email": "البريد الإلكتروني غير صحيح",
    "any.required": "البريد الإلكتروني مطلوب",
  }),

  name: Joi.string().min(2).max(50).required().messages({
    "string.min": "الاسم يجب أن يكون على الأقل حرفين",
    "string.max": "الاسم يجب أن لا يتجاوز 50 حرف",
    "any.required": "الاسم مطلوب",
  }),

  password: Joi.string().min(6).required().messages({
    "string.min": "كلمة المرور يجب أن تكون على الأقل 6 أحرف",
    "any.required": "كلمة المرور مطلوبة",
  }),

  phone: Joi.string().min(8).max(20).required().messages({
    "string.min": "رقم الهاتف غير صحيح",
    "string.max": "رقم الهاتف غير صحيح",
    "any.required": "رقم الهاتف مطلوب",
  }),

  role: Joi.string().valid("customer", "handyman").default("customer").messages({
    "any.only": "الدور يجب أن يكون customer أو handyman",
  }),

  // Optional fields
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional().allow(null),

  // Handyman specific fields
  profession: Joi.string().when("role", {
    is: "handyman",
    then: Joi.required().messages({
      "any.required": "المهنة مطلوبة للحرفي",
    }),
    otherwise: Joi.optional().allow("", null),
  }),

  price: Joi.number().min(0).when("role", {
    is: "handyman",
    then: Joi.required().messages({
      "any.required": "السعر مطلوب للحرفي",
    }),
    otherwise: Joi.optional().allow(null),
  }),

  experienceYears: Joi.number().min(0).default(0).optional().allow(null),

  bio: Joi.string().max(500).optional().allow("", null),

  gallery: Joi.array().items(Joi.string()).optional(),

  address: Joi.string().max(200).optional().allow("", null),
}).unknown(true);

module.exports = registerSchema;
