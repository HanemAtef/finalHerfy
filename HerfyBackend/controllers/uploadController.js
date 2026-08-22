// ========== 1. Upload a single image (avatar / profile photo) ==========
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "لم يتم إرسال أي صورة" });
    }

    // multer-storage-cloudinary sets `path` to the Cloudinary secure_url
    // and `filename` to the Cloudinary public_id.
    res.status(200).json({
      msg: "تم رفع الصورة بنجاح",
      url: req.file.path,
      publicId: req.file.filename,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 2. Upload multiple images (order photos / gallery) ==========
const uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ msg: "لم يتم إرسال أي صور" });
    }

    const urls = req.files.map((file) => file.path);
    const publicIds = req.files.map((file) => file.filename);

    res.status(200).json({
      msg: "تم رفع الصور بنجاح",
      urls,
      publicIds,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 3. Upload a voice message (chat audio) ==========
const uploadAudioFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "لم يتم إرسال أي ملف صوتي" });
    }

    res.status(200).json({
      msg: "تم رفع الرسالة الصوتية بنجاح",
      url: req.file.path,
      publicId: req.file.filename,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = {
  uploadImage,
  uploadImages,
  uploadAudioFile,
};
