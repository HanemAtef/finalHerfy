const { GoogleGenAI } = require("@google/genai");

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  GEMINI_API_KEY is not set — the AI chatbot will not work.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configurable so we can swap models without touching code (e.g. if a
// model is retired/deprecated on Google's side).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

module.exports = { ai, GEMINI_MODEL };
