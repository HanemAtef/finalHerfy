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

// ========== 4. Upload document (PDF / Image) and optionally save to user profile ==========
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");

const uploadBuffer = (buffer, mimetype, folder = 'herfy/customer-docs') => {
  return new Promise((resolve) => {
    try {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'auto' },
        (err, result) => {
          if (err || !result?.secure_url) {
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

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "لم يتم إرسال أي وثيقة" });
    }

    let fileUrl = req.file.path;
    if (!fileUrl && req.file.buffer) {
      fileUrl = await uploadBuffer(req.file.buffer, req.file.mimetype);
    }

    const { type = "national_id" } = req.body;
    const documentData = {
      type,
      url: fileUrl,
      filename: req.file.filename || req.file.originalname,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
      status: "pending",
    };

    // If user is authenticated, save document to their profile
    if (req.user?.id) {
      const user = await User.findById(req.user.id);
      if (user) {
        if (!Array.isArray(user.documents)) user.documents = [];
        user.documents.push(documentData);
        if (type === "national_id" && !user.nationalId) {
          user.nationalId = fileUrl;
        }
        await user.save();
      }
    }

    res.status(200).json({
      msg: "تم رفع الوثيقة بنجاح",
      document: documentData,
      url: fileUrl,
      publicId: req.file.filename || "",
    });
  } catch (error) {
    console.error("Upload document error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

module.exports = {
  uploadImage,
  uploadImages,
  uploadAudioFile,
  uploadDocument,
};
