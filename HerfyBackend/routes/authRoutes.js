// HerfyBackend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

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

// إعداد تخزين الملفات
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// فلترة الملفات المسموحة
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

// إعداد multer
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
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again after 15 minutes."
});

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
router.post("/verify-email", verifyEmail);
router.post("/resend-otp", resendVerificationOtp);

/********* SESSION FLOW *********/
router.post("/refresh", refreshAccessToken);
router.post("/logout", logoutUser);

/********* LOGIN *********/
router.post("/login", loginLimiter, validate(loginSchema), loginUser);

/********* PROFILE *********/
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, validate(updateProfileSchema), updateProfile);
router.put("/change-password", authMiddleware, validate(changePasswordSchema), changePassword);

/********* RESET PASSWORD FLOW *********/
router.post("/forgot-password", sendResetOtp);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

module.exports = router;
