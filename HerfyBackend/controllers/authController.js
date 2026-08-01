// HerfyBackend/controllers/authController.js
const User = require("../models/User");
const HandyMan = require("../models/Handyman");
const RefreshToken = require("../models/RefreshToken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const generateToken = require("../utils/generateToken");
const { generateAccessToken, generateRefreshTokenValue, hashToken } = generateToken;

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Issues a fresh access token + a fresh (rotated) refresh token for a user,
// persisting the refresh token's hash so it can be looked up / revoked.
const issueTokenPair = async (user, userAgent) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshTokenValue();

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: userAgent || "",
  });

  return { accessToken, refreshToken };
};

const publicUser = (user) => ({
  _id: user._id,
  email: user.email,
  name: user.name,
  role: user.role,
  isAdmin: user.isAdmin,
  phone: user.phone,
  location: user.location,
  city: user.city,
  profileImage: user.profileImage,
  isVerified: user.isVerified,
});

/********* register user - مع دعم الملفات وحالة pending *********/
const registerUser = async (req, res) => {
  try {
    let {
      email, name, password, role, phone, location, city,
      profession, price, experienceYears, bio, gallery, address
    } = req.body;

    // Normalize email
    email = email?.toLowerCase().trim();

    // Validation
    if (role === "admin") {
      return res.status(400).json({ msg: "Cannot register as admin" });
    }
    if (role === "handyman" && (!profession || !price)) {
      return res.status(400).json({ msg: "Profession and price are required for handyman" });
    }

    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(400).json({ msg: "User already exist" });
    }

    // Handle location
    let coordinates = null;
    if (location && location.coordinates && Array.isArray(location.coordinates)) {
      coordinates = location.coordinates;
    } else if (Array.isArray(location)) {
      coordinates = location;
    }

    // Create User
    const user = await User.create({
      email,
      name,
      password,
      role,
      phone,
      city: city || null,
      ...(coordinates ? { location: { type: "Point", coordinates } } : {}),
    });

    // If handyman, create Handyman profile with pending status
    if (role === "handyman") {
      try {
        // Get uploaded files from multer (if any)
        const nationalId = req.files?.nationalId ? req.files.nationalId[0].path : null;
        const certificate = req.files?.certificate ? req.files.certificate[0].path : null;
        const profileImage = req.files?.profileImage ? req.files.profileImage[0].path : null;

        // Check if handyman already exists (shouldn't happen, but just in case)
        const existingHandyman = await HandyMan.findOne({ userId: user._id });
        if (existingHandyman) {
          // If exists, update it instead of creating new
          existingHandyman.profession = profession;
          existingHandyman.price = parseFloat(price);
          existingHandyman.experienceYears = parseInt(experienceYears) || 0;
          existingHandyman.bio = bio || '';
          existingHandyman.gallery = gallery || [];
          existingHandyman.nationalId = nationalId || existingHandyman.nationalId;
          existingHandyman.certificate = certificate || existingHandyman.certificate;
          existingHandyman.profileImage = profileImage || existingHandyman.profileImage;
          existingHandyman.address = address || existingHandyman.address;
          existingHandyman.location = coordinates ? { type: 'Point', coordinates } : existingHandyman.location;
          existingHandyman.registrationStatus = 'pending';
          existingHandyman.registeredAt = new Date();
          existingHandyman.verified = false;
          await existingHandyman.save();
        } else {
          // Create new handyman
          await HandyMan.create({
            userId: user._id,
            profession,
            price: parseFloat(price),
            experienceYears: parseInt(experienceYears) || 0,
            bio: bio || '',
            gallery: gallery || [],
            nationalId,
            certificate,
            profileImage,
            address: address || '',
            location: coordinates ? { type: 'Point', coordinates } : undefined,
            registrationStatus: 'pending',
            registeredAt: new Date(),
            verified: false,
            isAvailable: true,
            rating: 0,
            completedOrders: 0
          });
        }

        // Send notification to admin via Socket.io
        const io = req.app?.get('io');
        if (io) {
          io.emit('newRegistrationRequest', {
            handymanId: user._id,
            userId: user._id,
            name: user.name,
            profession: profession,
            email: user.email,
            phone: user.phone
          });
        }

        console.log(`✅ New handyman registration: ${user.name} (${user.email}) - pending approval`);

      } catch (handymanErr) {
        // Rollback: delete user if handyman creation fails
        await User.deleteOne({ _id: user._id });
        console.error('❌ Handyman creation failed:', handymanErr);
        throw handymanErr;
      }
    }

    // Generate OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = otp;
    user.emailOtpExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(user.email, otp);
    } catch (mailErr) {
      console.log("Failed to send verification email:", mailErr.message);
    }

    // Response
    const response = {
      msg: "تم إنشاء الحساب، من فضلك تحقق من بريدك الإلكتروني",
      needsVerification: true,
      email: user.email,
      role: user.role,
    };

    // Add handyman specific info
    if (role === 'handyman') {
      response.registrationStatus = 'pending';
      response.handymanId = user._id;
      response.message = 'تم تسجيل حسابك كحرفي. في انتظار موافقة الأدمن.';
    }

    res.status(201).json(response);

  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

/********* verify email with OTP (registration flow) *********/
const verifyEmail = async (req, res) => {
  try {
    let { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ msg: "البريد الإلكتروني والرمز مطلوبان" });
    }
    email = email.toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
    }

    if (user.isVerified) {
      return res.status(400).json({ msg: "الحساب موثق بالفعل" });
    }

    if (!user.emailOtp || user.emailOtp !== otp) {
      return res.status(400).json({ msg: "رمز التحقق غير صحيح" });
    }

    if (!user.emailOtpExpire || user.emailOtpExpire < Date.now()) {
      return res.status(400).json({ msg: "انتهت صلاحية رمز التحقق" });
    }

    user.isVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpire = undefined;
    await user.save();

    // Check if user is handyman and get registration status
    let registrationStatus = null;
    if (user.role === 'handyman') {
      const handyman = await HandyMan.findOne({ userId: user._id });
      if (handyman) {
        registrationStatus = handyman.registrationStatus;
      }
    }

    const { accessToken, refreshToken } = await issueTokenPair(user, req.headers["user-agent"]);
    
    const response = {
      msg: "تم توثيق الحساب بنجاح",
      token: accessToken,
      refreshToken,
      user: publicUser(user),
    };

    if (registrationStatus) {
      response.registrationStatus = registrationStatus;
      if (registrationStatus === 'pending') {
        response.msg = "تم توثيق الحساب. حسابك في انتظار موافقة الأدمن.";
      } else if (registrationStatus === 'approved') {
        response.msg = "تم توثيق الحساب. حسابك مفعل بالكامل!";
      }
    }

    res.status(200).json(response);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* resend the email verification OTP *********/
const resendVerificationOtp = async (req, res) => {
  try {
    let { email } = req.body;
    email = email?.toLowerCase().trim();
    const user = await User.findOne({ email });

    if (user && !user.isVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.emailOtp = otp;
      user.emailOtpExpire = Date.now() + 10 * 60 * 1000;
      await user.save();
      await sendVerificationEmail(email, otp);
    }

    res.status(200).json({ msg: "إذا كان هذا البريد مسجلاً وغير موثق، تم إرسال رمز تحقق جديد" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* login user *********/
const loginUser = async (req, res) => {
  try {
    let { email, password, location } = req.body;
    email = email?.toLowerCase().trim();

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        msg: user.banReason ? `تم حظر هذا الحساب: ${user.banReason}` : "تم حظر هذا الحساب. تواصل مع الدعم الفني." 
      });
    }

    if (user.deletedAt) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        msg: "من فضلك وثّق بريدك الإلكتروني أولاً",
        needsVerification: true,
        email: user.email,
      });
    }

    // Check handyman status if role is handyman
    let handymanStatus = null;
    if (user.role === 'handyman') {
      const handyman = await HandyMan.findOne({ userId: user._id });
      if (handyman) {
        handymanStatus = handyman.registrationStatus;
        
        // If handyman registration is rejected
        if (handymanStatus === 'rejected') {
          return res.status(403).json({
            msg: `تم رفض طلب التسجيل الخاص بك. السبب: ${handyman.adminNote || handyman.rejectedReason || 'غير محدد'}`,
            status: 'rejected',
            note: handyman.adminNote || handyman.rejectedReason
          });
        }
        
        // If handyman registration is pending
        if (handymanStatus === 'pending') {
          return res.status(403).json({
            msg: "حسابك في انتظار موافقة الأدمن. يرجى التحقق من بريدك الإلكتروني للإشعارات.",
            status: 'pending',
            email: user.email
          });
        }
      } else {
        // User is handyman but no profile exists (shouldn't happen)
        return res.status(403).json({
          msg: "بيانات الحرفي غير مكتملة. يرجى التواصل مع الدعم.",
        });
      }
    }

    const { accessToken, refreshToken } = await issueTokenPair(user, req.headers["user-agent"]);

    const response = {
      msg: "User logged in successfully",
      token: accessToken,
      refreshToken,
      user: publicUser(user),
    };

    if (handymanStatus) {
      response.handymanStatus = handymanStatus;
    }

    res.status(200).json(response);
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* refresh access token *********/
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ msg: "refreshToken is required" });
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      return res.status(401).json({ msg: "جلسة غير صالحة، من فضلك سجل الدخول مرة أخرى" });
    }

    const user = await User.findById(stored.userId);
    if (!user || user.isBanned || user.deletedAt) {
      return res.status(401).json({ msg: "جلسة غير صالحة" });
    }

    stored.revoked = true;
    await stored.save();

    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, req.headers["user-agent"]);

    res.status(200).json({
      token: accessToken,
      refreshToken: newRefreshToken,
      user: publicUser(user),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* logout: revoke a refresh token *********/
const logoutUser = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.updateOne(
        { tokenHash: hashToken(refreshToken) },
        { revoked: true }
      );
    }
    res.status(200).json({ msg: "تم تسجيل الخروج" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* get user profile *********/
const getMe = async (req, res) => {
  try {
    const user = req.user;
    
    let handymanData = null;
    if (user.role === 'handyman') {
      handymanData = await HandyMan.findOne({ userId: user._id })
        .select('profession price rating verified isAvailable registrationStatus adminNote experienceYears bio gallery');
    }

    res.status(200).json({
      msg: "User profile",
      user: publicUser(user),
      ...(handymanData && { handyman: handymanData })
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* generate reset password *********/
const sendResetOtp = async (req, res) => {
  try {
    let { email } = req.body;
    email = email?.toLowerCase().trim();

    const user = await User.findOne({ email });

    if (user) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.otp = otp;
      user.otpExpire = Date.now() + 5 * 60 * 1000;
      await user.save();
      await sendEmail(email, otp);
    }

    res.status(200).json({
      msg: "إذا كان هذا البريد مسجلاً، تم إرسال رمز إعادة تعيين كلمة المرور",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body;
    email = email?.toLowerCase().trim();

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: "Invalid OTP" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ msg: "Invalid OTP" });
    }

    if (user.otpExpire < Date.now()) {
      return res.status(400).json({ msg: "OTP expired" });
    }

    user.password = newPassword;
    user.otp = null;
    user.otpExpire = null;
    await user.save();

    await RefreshToken.updateMany({ userId: user._id, revoked: false }, { revoked: true });

    res.status(200).json({
      msg: "Password reset successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* update current user's profile *********/
const updateProfile = async (req, res) => {
  try {
    const allowedFields = ["name", "phone", "profileImage", "location", "city"];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json({
      msg: "Profile updated successfully",
      user: {
        ...publicUser(user),
        profileImage: user.profileImage,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ msg: 'User not found' });

    const matches = await user.matchPassword(currentPassword);
    if (!matches) return res.status(400).json({ msg: 'Current password is incorrect' });
    if (currentPassword === newPassword) {
      return res.status(400).json({ msg: 'New password must be different' });
    }

    user.password = newPassword;
    await user.save();
    await RefreshToken.updateMany({ userId: user._id, revoked: false }, { revoked: true });

    res.status(200).json({ msg: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = {
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
};
