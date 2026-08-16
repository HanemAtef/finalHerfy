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
const resetPasswordSchema = require("../validations/resetPassSchema");
const updateProfileSchema = require("../validations/updateProfileSchema");
const changePasswordSchema = require("../validations/changePasswordSchema");

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

// ÙÙ„ØªØ±Ø© Ø§Ù„Ù…Ù„ÙØ§Øª Ø§Ù„Ù…Ø³Ù…ÙˆØ­Ø©
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images and PDF files are allowed'), false);
  }
};

// Ø¥Ø¹Ø¯Ø§Ø¯ multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

// Multer leaves multipart field names such as `location[coordinates][0]`
// flat in req.body. Convert the registration form's fields before Joi
// validates them so location is preserved as a GeoJSON object.
const normalizeRegistrationLocation = (req, res, next) => {
  const submittedLocation = req.body?.location;
  const nestedCoordinates = submittedLocation?.coordinates;
  const longitude = req.body?.['location[coordinates][0]']
    ?? nestedCoordinates?.[0];
  const latitude = req.body?.['location[coordinates][1]']
    ?? nestedCoordinates?.[1];

  if (longitude !== undefined && latitude !== undefined) {
    req.body.location = {
      type: req.body['location[type]'] || submittedLocation?.type || 'Point',
      coordinates: [Number(longitude), Number(latitude)],
    };
  }

  delete req.body?.['location[type]'];
  delete req.body?.['location[coordinates][0]'];
  delete req.body?.['location[coordinates][1]'];
  next();
};

// =====================================================
// ========== RATE LIMITING ==========
// =====================================================

const rateLimit = require("express-rate-limit");
const authLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_AUTH_WINDOW) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  message: "Too many login attempts, please try again after 15 minutes."
});

// =====================================================
// ========== AUTH ROUTES ==========
// =====================================================

/********* REGISTER - Ù…Ø¹ Ø¯Ø¹Ù… Ø±ÙØ¹ Ø§Ù„Ù…Ù„ÙØ§Øª Ù„Ù„Ø­Ø±ÙÙŠ *********/
router.post(
  "/register",
  upload.fields([
    { name: 'nationalId', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
    { name: 'profileImage', maxCount: 1 }
  ]),
  normalizeRegistrationLocation,
  validate(registerSchema),
  registerUser
);

// =====================================================
// ========== AUTH ROUTES ==========
// =====================================================

/********* REGISTER - مع دعم رفع الملفات للحرفي *********/
router.post(
  "/register",
  upload.fields([
    { name: 'nationalId', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
    { name: 'profileImage', maxCount: 1 }
  ]),
  normalizeRegistrationLocation,
  validate(registerSchema),
  registerUser
);

/********* EMAIL VERIFICATION FLOW *********/
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-otp", authLimiter, resendVerificationOtp);

/********* SESSION FLOW *********/
router.post("/refresh", refreshAccessToken);
router.post("/logout", logoutUser);

/********* LOGIN *********/
router.post("/login", authLimiter, validate(loginSchema), loginUser);

/********* PROFILE *********/
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, validate(updateProfileSchema), updateProfile);
router.put("/change-password", authMiddleware, validate(changePasswordSchema), changePassword);

/********* RESET PASSWORD FLOW *********/
router.post("/forgot-password", authLimiter, sendResetOtp);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), resetPassword);

module.exports = router;
