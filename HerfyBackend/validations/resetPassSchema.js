const Joi = require("joi");

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "البريد الإلكتروني غير صحيح",
    "string.empty": "البريد الإلكتروني مطلوب",
    "any.required": "البريد الإلكتروني مطلوب",
  }),

  otp: Joi.string().length(6).required().messages({
    "string.length": "OTP يجب أن يكون 6 أرقام",
    "string.empty": "OTP مطلوب",
  }),

  newPassword: Joi.string().min(6).max(100).required().messages({
    "string.min": "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    "string.empty": "كلمة المرور مطلوبة",
    "any.required": "كلمة المرور مطلوبة",
  }),
});

module.exports = resetPasswordSchema;