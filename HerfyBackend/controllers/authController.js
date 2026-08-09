const User = require("../models/User");
const HandyMan = require("../models/Handyman");
const RefreshToken = require("../models/RefreshToken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const generateToken = require("../utils/generateToken");
const { generateAccessToken, generateRefreshTokenValue, hashToken } =
  generateToken;

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
  penaltyCount: user.penaltyCount,
  penaltyAmount: user.penaltyAmount,
});

// console.log({
//   penaltyCount: user.penaltyCount,
//   penaltyAmount: user.penaltyAmount,
// });

/********* register user *********/
const registerUser = async (req, res) => {
  try {
    let {
      email,
      name,
      password,
      role,
      phone,
      location,
      city,
      profession,
      price,
      experienceYears,
      bio,
      gallery,
    } = req.body;

    // FIX (M2): normalize before any lookup/write so casing never causes a
    // duplicate account or a false "not found".
    email = email?.toLowerCase().trim();

    // SECURITY/BUG FIX (C7/H2): all validation now happens BEFORE any User
    // document is written. Previously the admin-role check and the
    // handyman profession/price check both ran AFTER `User.create(...)`,
    // so a failed handyman registration left a real, unverified,
    // permanently-orphaned account behind (no Handyman profile, email
    // forever "already exists" on retry). The admin check was also
    // unreachable dead code since it ran after creation.
    if (role === "admin") {
      return res.status(400).json({ msg: "Cannot register as admin" });
    }
    if (role === "handyman" && (!profession || !price)) {
      return res
        .status(400)
        .json({ msg: "Profession and price are required for handyman" });
    }

    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(400).json({ msg: "User already exist" });
    }

    // FIX (Low #2): previously defaulted to coordinates=[0,0] and always
    // wrote a real GeoJSON Point, even when no location was supplied —
    // silently polluting $near queries (see models/User.js for the schema
    // side of this fix). Now the field is only set at all when the client
    // actually gave real coordinates.
    let coordinates = null;
    if (
      location &&
      location.coordinates &&
      Array.isArray(location.coordinates)
    ) {
      coordinates = location.coordinates;
    } else if (Array.isArray(location)) {
      coordinates = location;
    }

    const user = await User.create({
      email,
      name,
      password,
      role,
      phone,
      city: city || null,
      ...(coordinates ? { location: { type: "Point", coordinates } } : {}),
    });

    if (role === "handyman") {
      try {
        await HandyMan.create({
          userId: user._id,
          profession,
          price,
          experienceYears,
          bio,
          gallery: gallery || [],
        });
      } catch (handymanErr) {
        // Roll back the User row rather than leaving an orphaned,
        // permanently-blocked account behind if the Handyman profile
        // creation fails for any reason (e.g. a future schema constraint).
        await User.deleteOne({ _id: user._id });
        throw handymanErr;
      }
    }

    // Registration no longer logs the user in directly: an email OTP must be
    // verified first (see verifyEmail below). We still create the account so
    // the handyman profile linkage above works, but no JWT is issued yet.
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOtp = otp;
    user.emailOtpExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
      await sendVerificationEmail(user.email, otp);
    } catch (mailErr) {
      console.log("Failed to send verification email:", mailErr.message);
      // Don't fail registration just because the mail provider hiccuped —
      // the user can hit /resend-otp from the verify screen.
    }

    res.status(201).json({
      msg: "تم إنشاء الحساب، من فضلك تحقق من بريدك الإلكتروني",
      needsVerification: true,
      email: user.email,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
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
      // FIX (M1): "User not found" here previously let an attacker confirm
      // whether an email is registered. Same generic message as an invalid
      // OTP — the two cases are indistinguishable from the outside.
      return res
        .status(400)
        .json({ msg: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
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

    const { accessToken, refreshToken } = await issueTokenPair(
      user,
      req.headers["user-agent"],
    );
    res.status(200).json({
      msg: "تم توثيق الحساب بنجاح",
      token: accessToken,
      refreshToken,
      user: publicUser(user),
    });
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

    // FIX (M1): don't reveal whether this email is registered (or already
    // verified) via response differences — always respond the same way,
    // and only actually send an OTP if there's a real, unverified account.
    if (user && !user.isVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.emailOtp = otp;
      user.emailOtpExpire = Date.now() + 10 * 60 * 1000;
      await user.save();
      await sendVerificationEmail(email, otp);
    }

    res.status(200).json({
      msg: "إذا كان هذا البريد مسجلاً وغير موثق، تم إرسال رمز تحقق جديد",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};

/********* login user *********/
const loginUser = async (req, res) => {
  try {
    //get data from request body
    let { email, password, location } = req.body;
    // FIX (M2): normalize before lookup so case doesn't cause a false negative.
    email = email?.toLowerCase().trim();
    //find user by email
    const user = await User.findOne({ email });
    // FIX (M1): "User not found" vs "Invalid password" let an attacker
    // enumerate registered emails. Both cases now return the same
    // generic message.
    if (!user) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }
    //compare password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }
    if (user.isBanned) {
      return res.status(403).json({
        msg: user.banReason
          ? `تم حظر هذا الحساب: ${user.banReason}`
          : "تم حظر هذا الحساب. تواصل مع الدعم الفني.",
      });
    }
    // FIX (M4): soft-deleted accounts can no longer log in.
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
    //generate token pair
    const { accessToken, refreshToken } = await issueTokenPair(
      user,
      req.headers["user-agent"],
    );
    //send response
    res.status(200).json({
      msg: "User logged in successfully",
      token: accessToken,
      refreshToken,
      user: publicUser(user),
    });
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
      return res
        .status(401)
        .json({ msg: "جلسة غير صالحة، من فضلك سجل الدخول مرة أخرى" });
    }

    const user = await User.findById(stored.userId);
    // FIX (M4): a soft-deleted user's outstanding refresh token should no
    // longer be usable, same as a banned user's.
    if (!user || user.isBanned || user.deletedAt) {
      return res.status(401).json({ msg: "جلسة غير صالحة" });
    }

    // Rotate: revoke the used token, issue a brand new pair.
    stored.revoked = true;
    await stored.save();

    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
      user,
      req.headers["user-agent"],
    );

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
        { revoked: true },
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
    res.status(200).json({
      msg: "User profile",
      user: publicUser(user),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};
//generate reset password
const sendResetOtp = async (req, res) => {
  try {
    let { email } = req.body;
    email = email?.toLowerCase().trim();

    const user = await User.findOne({ email });

    // FIX (M1): always respond the same way regardless of whether the
    // email is registered — only actually send an OTP if it is.
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
      // FIX (M1): same message as an actually-wrong OTP, for consistency
      // with the rest of this flow's enumeration hardening.
      return res.status(400).json({ msg: "Invalid OTP" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ msg: "Invalid OTP" });
    }

    if (user.otpExpire < Date.now()) {
      return res.status(400).json({ msg: "OTP expired" });
    }

    // update password
    user.password = newPassword;

    // clear otp
    user.otp = null;
    user.otpExpire = null;

    await user.save();

    // Password changed — kill all existing sessions for this user.
    await RefreshToken.updateMany(
      { userId: user._id, revoked: false },
      { revoked: true },
    );

    res.status(200).json({
      msg: "Password reset successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ msg: "Server error" });
  }
};
////////////////////////

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

module.exports = {
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
};
