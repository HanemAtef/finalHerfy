const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { askChatbot } = require("../controllers/chatbotController");
const { authMiddleware } = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validationMiddleware");
const chatbotSchema = require("../validations/chatbotSchema");

// Each call hits a paid external API (Gemini), so this endpoint gets a
// stricter limiter than the general "/api" one — protects the Gemini
// quota/bill from being drained by a single abusive user.
const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message: { msg: "عدد كبير من الرسائل، حاول مرة أخرى بعد قليل" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/ask", authMiddleware, chatbotLimiter, validate(chatbotSchema), askChatbot);

module.exports = router;
