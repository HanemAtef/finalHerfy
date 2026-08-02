// HerfyBackend/validations/resetPassSchema.js
const Joi = require("joi");

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'البريد الإلكتروني غير صحيح',
    'any.required': 'البريد الإلكتروني مطلوب'
  }),
  
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required().messages({
    'string.length': 'رمز التحقق يجب أن يكون 6 أرقام',
    'string.pattern.base': 'رمز التحقق يجب أن يكون أرقام فقط',
    'any.required': 'رمز التحقق مطلوب'
  }),
  
  newPassword: Joi.string().min(6).required().messages({
    'string.min': 'كلمة المرور يجب أن تكون على الأقل 6 أحرف',
    'any.required': 'كلمة المرور الجديدة مطلوبة'
  })
});

module.exports = resetPasswordSchema;