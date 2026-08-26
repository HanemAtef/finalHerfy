// HerfyBackend/middlewares/authMiddleware.js
const JWT = require('jsonwebtoken');
const User = require('../models/User');
const Handyman = require('../models/Handyman');

// =====================================================
// ========== MAIN AUTH MIDDLEWARE ==========
// =====================================================

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        success: false,
        msg: "No token provided" 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = JWT.verify(token, process.env.JWT_SECRET);
    
    // Get user
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ 
        success: false,
        msg: "User not found" 
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({ 
        success: false,
        msg: user.banReason ? `تم حظر هذا الحساب: ${user.banReason}` : "تم حظر هذا الحساب. تواصل مع الدعم الفني." 
      });
    }

    // Check if user is soft-deleted
    if (user.deletedAt) {
      return res.status(401).json({ 
        success: false,
        msg: "هذا الحساب لم يعد موجوداً" 
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({ 
        success: false,
        msg: "يرجى توثيق بريدك الإلكتروني أولاً",
        needsVerification: true
      });
    }

    // Check user registration status (support routes exempt)
    if (!user.isAdmin && !req.originalUrl?.includes('/api/support')) {
      if (user.status === 'pending') {
        return res.status(403).json({
          success: false,
          msg: "Your registration is pending admin approval.",
          status: 'pending'
        });
      }
      if (user.status === 'rejected') {
        return res.status(403).json({
          success: false,
          msg: "Your registration request has been rejected.",
          status: 'rejected'
        });
      }
    }

    // =====================================================
    // ========== HANDYMAN SPECIFIC CHECKS ==========
    // =====================================================
    
    // If user is handyman, check registration status (support routes are exempt so users can contact admin)
    if (user.role === 'handyman' && !req.originalUrl?.includes('/api/support')) {
      const handyman = await Handyman.findOne({ userId: user._id });
      
      if (!handyman) {
        return res.status(403).json({
          success: false,
          msg: "بيانات الحرفي غير مكتملة. يرجى التواصل مع الدعم."
        });
      }

      // Check if registration is pending
      if (handyman.registrationStatus === 'pending') {
        return res.status(403).json({
          success: false,
          msg: "حسابك في انتظار موافقة الأدمن. يرجى التحقق من بريدك الإلكتروني للإشعارات.",
          status: 'pending'
        });
      }

      // Check if registration is rejected
      if (handyman.registrationStatus === 'rejected') {
        const reason = handyman.adminNote || handyman.rejectedReason || 'غير محدد';
        return res.status(403).json({
          success: false,
          msg: `تم رفض طلب التسجيل الخاص بك. السبب: ${reason}`,
          status: 'rejected',
          reason: reason
        });
      }

      // Check if handyman is suspended (exempt support and fines settlement routes)
      if (handyman.isSuspended && !req.originalUrl?.includes('/fines') && !req.originalUrl?.includes('/penalty') && !req.originalUrl?.includes('/status')) {
        return res.status(403).json({
          success: false,
          msg: handyman.suspendedReason ? `حسابك معلق مؤقتاً: ${handyman.suspendedReason}` : "حسابك معلق مؤقتاً",
          status: 'suspended',
          reason: handyman.suspendedReason
        });
      }

      // Attach handyman data to request for easy access
      req.handyman = handyman;
    }

    req.user = user;
    next();
    
  } catch (err) {
    console.log("Auth error:", err.message);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        msg: "رمز غير صالح" 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        msg: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى" 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      msg: "Invalid token" 
    });
  }
};

// =====================================================
// ========== ROLE-BASED AUTHORIZATION ==========
// =====================================================

// Check if user has allowed role(s)
const allowedToMiddleware = (...roles) => {
  return (req, res, next) => {
    // Admin can access everything
    if (req.user.isAdmin) {
      return next();
    }

    // Check if user's role is in allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} not authorized for this action`,
        allowedRoles: roles
      });
    }
    
    next();
  };
};

// =====================================================
// ========== HANDYMAN STATUS CHECK ==========
// =====================================================

// Check if handyman is approved and active
const checkHandymanActive = async (req, res, next) => {
  try {
    if (req.user.role !== 'handyman') {
      return res.status(403).json({
        success: false,
        msg: "هذه الصفحة مخصصة للحرفيين فقط"
      });
    }

    const handyman = req.handyman || await Handyman.findOne({ userId: req.user._id });
    
    if (!handyman) {
      return res.status(404).json({
        success: false,
        msg: "بيانات الحرفي غير موجودة"
      });
    }

    // Check if handyman is approved
    if (handyman.registrationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        msg: handyman.registrationStatus === 'pending' 
          ? "حسابك في انتظار الموافقة" 
          : "تم رفض حسابك",
        status: handyman.registrationStatus
      });
    }

    // Check if handyman is suspended
    if (handyman.isSuspended) {
      return res.status(403).json({
        success: false,
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : "حسابك معلق مؤقتاً"
      });
    }

    req.handyman = handyman;
    next();
    
  } catch (error) {
    console.error('Handyman check error:', error);
    res.status(500).json({
      success: false,
      msg: "حدث خطأ في التحقق من حالة الحرفي"
    });
  }
};

// =====================================================
// ========== ADMIN SPECIFIC CHECKS ==========
// =====================================================

// Check if user is admin
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        msg: "غير مصرح به - يرجى تسجيل الدخول"
      });
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        msg: "غير مصرح لك بالوصول إلى هذه الصفحة - هذه الصفحة مخصصة للأدمن فقط"
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      msg: "حدث خطأ في التحقق من صلاحيات الأدمن"
    });
  }
};

// =====================================================
// ========== EXPORTS ==========
// =====================================================

module.exports = { 
  authMiddleware, 
  allowedToMiddleware,
  checkHandymanActive,
  adminMiddleware
};