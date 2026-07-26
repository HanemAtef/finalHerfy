const express = require("express");
const router = express.Router();

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
  verifyEmail,
  resendVerificationOtp,
  refreshAccessToken,
  logoutUser,
} = require("../controllers/authController");
const resetPasswordSchema = require("../validations/resetPassSchema");
const updateProfileSchema = require("../validations/updateProfileSchema");


// register
router.post("/register", validate(registerSchema), registerUser);

/********* EMAIL VERIFICATION FLOW *********/
router.post("/verify-email", verifyEmail);
router.post("/resend-otp", resendVerificationOtp);

/********* SESSION FLOW *********/
router.post("/refresh", refreshAccessToken);
router.post("/logout", logoutUser);

const rateLimit = require("express-rate-limit");
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again after 15 minutes."
});

// login
router.post("/login", loginLimiter, validate(loginSchema), loginUser);

// profile
router.get("/me", authMiddleware, getMe);
router.put("/me", authMiddleware, validate(updateProfileSchema), updateProfile);

/********* RESET PASSWORD FLOW *********/

// send OTP
router.post("/forgot-password", sendResetOtp);

//  verify OTP + reset password
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

module.exports = router;

