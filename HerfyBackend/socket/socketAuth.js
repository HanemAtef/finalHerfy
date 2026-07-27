const jwt = require("jsonwebtoken");
const User = require("../models/User");

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication failed"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return next(new Error("User not found"));
    }

    // SECURITY FIX (H6): REST's authMiddleware has always rejected banned
    // users; this socket auth never did, so a banned user's still-valid
    // token kept working for chat and live tracking after a ban.
    if (user.isBanned) {
      return next(new Error("تم حظر هذا الحساب. تواصل مع الدعم الفني."));
    }
    // FIX (M4): mirror the same soft-delete check enforced on REST/login.
    if (user.deletedAt) {
      return next(new Error("هذا الحساب لم يعد موجوداً"));
    }

    socket.user = user;

    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
};

module.exports = socketAuth;