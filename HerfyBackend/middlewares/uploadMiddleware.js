const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Make sure the uploads folder exists
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
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
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
});

// ===== Audio (voice messages in chat) =====
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
  storage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per voice note
});

module.exports = upload;
module.exports.uploadAudio = uploadAudio;
