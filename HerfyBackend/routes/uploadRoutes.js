const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const { uploadImage, uploadImages, uploadAudioFile } = require("../controllers/uploadController");

// A small wrapper so multer errors (wrong type / too big) return a clean JSON
// response instead of crashing the request.
const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ msg: err.message || "فشل رفع الملف" });
    }
    next();
  });
};

router.use(authMiddleware);

router.post("/image", handleUpload(upload.single("image")), uploadImage);
router.post("/images", handleUpload(upload.array("images", 10)), uploadImages);
router.post("/audio", handleUpload(upload.uploadAudio.single("audio")), uploadAudioFile);

module.exports = router;
