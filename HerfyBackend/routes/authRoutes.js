// HerfyBackend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const validate = require("../middlewares/validationMiddleware");
const registerSchema = require("../validations/registerValidationSchema");
const loginSchema = require("../validations/loginValidationSchema");
const resetPasswordSchema = require("../validations/resetPassSchema");
const updateProfileSchema = require("../validations/updateProfileSchema");
const changePasswordSchema = require("../validations/changePasswordSchema");

const { authMiddleware } = require("../middlewares/authMiddleware");

const {
  registerUser,
  loginUser,
  getMe,
  sendResetOtp,
  resetPassword,
  updateProfile,
  changePassword,
  verifyEmail,
  resendVerificationOtp,
  refreshAccessToken,
  logoutUser,
} = require("../controllers/authController");

// =====================================================
// ========== MULTER SETUP FOR FILE UPLOADS ==========
// =====================================================

// Ø¥Ø¹Ø¯Ø§Ø¯ ØªØ®Ø²ÙŠÙ† Ø§Ù„Ù…Ù„ÙØ§Øª
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'herfy/handyman-docs',
    resource_type: 'auto', // supports images and PDFs (nationalId/certificate)
  }),
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|pdf/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images and PDF files are allowed"), false);
  }
};

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// Normalize flat multer location fields into a GeoJSON object before Joi validation
const normalizeRegistrationLocation = (req, res, next) => {
  const submittedLocation = req.body?.location;
  const longitude = req.body?.["location[coordinates][0]"] ?? submittedLocation?.coordinates?.[0];
  const latitude = req.body?.["location[coordinates][1]"] ?? submittedLocation?.coordinates?.[1];

  if (longitude !== undefined && latitude !== undefined) {
    req.body.location = {
      type: req.body["location[type]"] || submittedLocation?.type || "Point",
      coordinates: [Number(longitude), Number(latitude)],
    };
  }

  delete req.body?.["location[type]"];
  delete req.body?.["location[coordinates][0]"];
  delete req.body?.["location[coordinates][1]"];
  next();
};

// ========== RATE LIMITING ==========
// const authLimiter = rateLimit({
//   windowMs: (parseInt(process.env.RATE_LIMIT_AUTH_WINDOW) || 15) * 60 * 1000,
//   max: process.env.NODE_ENV === "production" ? (parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10) : 1000,
//   message: "Too many login attempts, please try again after 15 minutes.",
// });

// ========== ROUTES ==========

router.post(
  "/register",
  upload.fields([
    { name: "nationalId", maxCount: 1 },
    { name: "certificate", maxCount: 1 },
    { name: "profileImage", maxCount: 1 },
  ]),
  normalizeRegistrationLocation,
  validate(registerSchema),
  registerUser
);

router.post("/verify-email", verifyEmail);

router.post("/resend-otp", resendVerificationOtp);

router.post("/refresh", refreshAccessToken);

router.post("/logout", logoutUser);

router.post("/login", validate(loginSchema), loginUser);

router.get("/me", authMiddleware, getMe);

router.put("/me", authMiddleware, validate(updateProfileSchema), updateProfile);

router.put(
  "/change-password",
  authMiddleware,
  validate(changePasswordSchema),
  changePassword
);

router.post("/forgot-password", sendResetOtp);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  resetPassword
);

module.exports = router;
