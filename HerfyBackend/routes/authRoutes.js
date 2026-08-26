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

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'herfy/handyman-docs',
    resource_type: 'auto', // supports images and PDFs
  }),
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|pdf|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("نوع الملف غير مدعوم. الملفات المسموحة: الصور و PDF"), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

const uploadBufferToCloudinary = (buffer, mimetype, folder = 'herfy/handyman-docs') => {
  return new Promise((resolve) => {
    try {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'auto' },
        (err, result) => {
          if (err || !result?.secure_url) {
            // If Cloudinary fails (e.g. FortiGate/network block), fallback to data URI
            const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
            return resolve(dataUri);
          }
          resolve(result.secure_url);
        }
      );
      uploadStream.on('error', () => {
        const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
        resolve(dataUri);
      });
      uploadStream.end(buffer);
    } catch {
      const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
      resolve(dataUri);
    }
  });
};

// Multer and Cloudinary upload handler wrapper
const handleRegisterUpload = (req, res, next) => {
  upload.fields([
    { name: "nationalId", maxCount: 1 },
    { name: "certificate", maxCount: 1 },
    { name: "profileImage", maxCount: 1 },
    { name: "document", maxCount: 5 },
    { name: "documents", maxCount: 5 },
  ])(req, res, async (err) => {
    if (err) {
      console.error("Register upload error:", err.message);
      return res.status(400).json({ msg: err.message || "فشل رفع الملفات المرفقة" });
    }

    try {
      if (req.files) {
        if (req.files.nationalId && req.files.nationalId[0]) {
          const f = req.files.nationalId[0];
          req.body.nationalId = await uploadBufferToCloudinary(f.buffer, f.mimetype);
        }
        if (req.files.certificate && req.files.certificate[0]) {
          const f = req.files.certificate[0];
          req.body.certificate = await uploadBufferToCloudinary(f.buffer, f.mimetype);
        }
        if (req.files.profileImage && req.files.profileImage[0]) {
          const f = req.files.profileImage[0];
          req.body.profileImage = await uploadBufferToCloudinary(f.buffer, f.mimetype);
        }
        // Handle generic documents array or single document
        const extraDocs = [...(req.files.document || []), ...(req.files.documents || [])];
        if (extraDocs.length > 0) {
          req.uploadedDocs = await Promise.all(
            extraDocs.map(async (f) => {
              const url = await uploadBufferToCloudinary(f.buffer, f.mimetype, 'herfy/customer-docs');
              return {
                type: f.fieldname === 'nationalId' ? 'national_id' : 'document',
                url,
                filename: f.filename || f.originalname,
                originalName: f.originalname,
                mimeType: f.mimetype,
                uploadedAt: new Date(),
                status: 'pending',
              };
            })
          );
        }
      }
      next();
    } catch (uploadErr) {
      console.error("Upload error:", uploadErr);
      next();
    }
  });
};

// Normalize flat multer location fields into a GeoJSON object before Joi validation
const normalizeRegistrationLocation = (req, res, next) => {
  const submittedLocation = req.body?.location;
  const longitude = req.body?.["location[coordinates][0]"] ?? submittedLocation?.coordinates?.[0];
  const latitude = req.body?.["location[coordinates][1]"] ?? submittedLocation?.coordinates?.[1];

  if (longitude !== undefined && latitude !== undefined && !isNaN(Number(longitude)) && !isNaN(Number(latitude))) {
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

// ========== ROUTES ==========

router.post(
  "/register",
  handleRegisterUpload,
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
