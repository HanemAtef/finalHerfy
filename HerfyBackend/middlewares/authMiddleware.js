const JWT = require('jsonwebtoken');
const User = require('../models/User');

// Middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ msg: "No token provided" });
    }

    const token = authHeader.split(' ')[1];
    const decoded = JWT.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ msg: "User not found" });
    }
    if (user.isBanned) {
      return res.status(403).json({ msg: "تم حظر هذا الحساب. تواصل مع الدعم الفني." });
    }
    // FIX (M4): a soft-deleted account's still-valid token should stop
    // working immediately, same as a banned one.
    if (user.deletedAt) {
      return res.status(401).json({ msg: "هذا الحساب لم يعد موجوداً" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.log("Auth error:", err.message);
    return res.status(401).json({ msg: "Invalid token" });
  }
};
//allowed user role 
const allowedToMiddleware = (...roles) => {
  return (req, res, next) => {
   
    if (req.user.isAdmin) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Role ${req.user.role} not authorized`,
      });
    }
    next();
  };
};

module.exports = { authMiddleware, allowedToMiddleware };