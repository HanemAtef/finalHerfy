const Joi = require("joi");

// Keep messages short — this also caps how many tokens we send to Gemini
// per request (cost control).
const chatbotSchema = Joi.object({
  message: Joi.string().trim().min(1).max(1000).required().messages({
    "string.empty": "الرسالة مطلوبة",
    "string.max": "الرسالة طويلة جداً (الحد الأقصى 1000 حرف)",
    "any.required": "الرسالة مطلوبة",
  }),
  // Short rolling history sent from the frontend so the bot has context
  // across turns. Capped so a malicious client can't blow up the prompt
  // size (and therefore the bill).
  history: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid("user", "model").required(),
        text: Joi.string().max(1000).required(),
      })
    )
    .max(20)
    .default([]),
});

module.exports = chatbotSchema;
