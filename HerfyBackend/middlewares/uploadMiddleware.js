const multer = require("multer");
const path = require("path");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

// ===== Images (avatars, order photos, gallery, chat images) =====
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: "herfy/images",
    resource_type: "image",
    // let cloudinary pick a unique public_id automatically
    format: undefined, // keep original format (jpg/png/webp/gif)
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
  }),
});

const extRegex = /\.(jpeg|jpg|png|webp|gif)$/i;
const mimeRegex = /^image\/(jpeg|jpg|png|webp|gif)$/i;

const fileFilter = (req, file, cb) => {
  const extValid = extRegex.test(path.extname(file.originalname).toLowerCase());
  const mimeValid = mimeRegex.test(file.mimetype);

  if (extValid && mimeValid) {
    return cb(null, true);
  }
  cb(new Error("نوع الملف غير مدعوم. الصور المسموحة: jpg, jpeg, png, webp, gif"));
};

const upload = multer({
  storage: imageStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

// ===== Audio (voice messages in chat) =====
// Cloudinary stores non-image/video files as "video" resource type (audio falls under video).
const audioStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: "herfy/audio",
    resource_type: "video",
  }),
});

const audioExtRegex = /\.(mp3|m4a|wav|ogg|webm|aac)$/i;
const audioMimeRegex = /^audio\//i;

const audioFileFilter = (req, file, cb) => {
  const extValid = audioExtRegex.test(path.extname(file.originalname).toLowerCase());
  const mimeValid = audioMimeRegex.test(file.mimetype);
  if (extValid || mimeValid) {
    return cb(null, true);
  }
  cb(new Error("نوع الملف غير مدعوم. الصوتيات المسموحة: mp3, m4a, wav, ogg, webm, aac"));
};

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per voice note
});

module.exports = upload;
module.exports.uploadAudio = uploadAudio;
