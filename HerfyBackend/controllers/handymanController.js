// HerfyBackend/controllers/handymanController.js
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const mongoose = require("mongoose");

// =====================================================
// ========== HELPER FUNCTIONS ==========
// =====================================================

const EARTH_RADIUS_M = 6371000;
const ASSUMED_AVG_SPEED_KMH = 30;

function haversineDistanceMeters([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// =====================================================
// ========== PUBLIC ROUTES ==========
// =====================================================

/**
 * @desc    Get nearby handymen based on location
 * @route   GET /api/handyman/nearby
 * @access  Public
 */
const getNearbyHandymen = async (req, res) => {
  try {
    const { lat, lng, radius = 50000000, profession, sort } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        msg: "Latitude and longitude are required",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    // Find nearby users with handyman role
    const nearbyUsers = await User.find({
      role: "handyman",
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: Number(radius),
        },
      },
    }).lean();

    const userIds = nearbyUsers.map(u => u._id);
    
    // Get handyman details - ONLY approved and not suspended
    const handymenDetails = await Handyman.find({ 
      userId: { $in: userIds },
      registrationStatus: 'approved', // Only approved handymen
      isSuspended: false, // Not suspended
      isAvailable: true // Available
    }).lean();
    
    const detailsMap = handymenDetails.reduce((acc, curr) => {
      acc[curr.userId.toString()] = curr;
      return acc;
    }, {});

    let handymenList = nearbyUsers
      .map((user) => {
        const details = detailsMap[user._id.toString()];
        if (!details) return null;

        if (profession && details.profession !== profession) {
          return null;
        }

        // Calculate distance and ETA
        let distance = null;
        let eta = null;
        if (Array.isArray(user.location?.coordinates) && user.location.coordinates.length === 2) {
          const meters = haversineDistanceMeters(
            [longitude, latitude],
            user.location.coordinates
          );
          distance = Math.round(meters);
          eta = Math.max(1, Math.round((meters / 1000 / ASSUMED_AVG_SPEED_KMH) * 60));
        }

        return {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          location: user.location,
          profileImage: user.profileImage,
          profession: details.profession,
          price: details.price,
          rating: details.rating,
          verified: details.verified,
          isAvailable: details.isAvailable,
          bio: details.bio,
          experienceYears: details.experienceYears,
          distance,
          eta,
          completedOrders: details.completedOrders,
          acceptanceRate: details.acceptanceRate || 1.0,
        };
      })
      .filter(Boolean);

    // Apply sorting
    if (sort === "smart" || !sort) {
      const DIST_WEIGHT = parseFloat(process.env.MATCHING_DISTANCE_WEIGHT) || 0.4;
      const RATING_WEIGHT = parseFloat(process.env.MATCHING_RATING_WEIGHT) || 0.4;
      const ACCEPT_WEIGHT = parseFloat(process.env.MATCHING_ACCEPTANCE_WEIGHT) || 0.2;
      const maxDistance = Number(radius);
      
      handymenList.forEach(h => {
         const normDist = h.distance ? Math.max(0, (maxDistance - h.distance) / maxDistance) : 0;
         const normRating = (h.rating || 0) / 5.0;
         const normAccept = h.acceptanceRate;
         h.smartScore = (normDist * DIST_WEIGHT) + (normRating * RATING_WEIGHT) + (normAccept * ACCEPT_WEIGHT);
      });
      handymenList.sort((a, b) => b.smartScore - a.smartScore);
    } else if (sort === "rating") {
      handymenList.sort((a, b) => b.rating - a.rating);
    } else if (sort === "price") {
      handymenList.sort((a, b) => a.price - b.price);
    } else if (sort === "distance") {
      handymenList.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    }

    res.status(200).json({
      count: handymenList.length,
      handymen: handymenList,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      msg: "Server Error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get handyman details by ID
 * @route   GET /api/handyman/:id
 * @access  Public
 */
const getHandymanDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findOne({ _id: id, role: "handyman" });
    if (!user) {
      return res.status(404).json({ msg: "Handyman not found" });
    }
    
    const details = await Handyman.findOne({ userId: user._id });
    if (!details) {
      return res.status(404).json({ msg: "Handyman profile not found" });
    }

    // Only return if approved and not suspended
    if (details.registrationStatus !== 'approved') {
      return res.status(404).json({ msg: "Handyman not available" });
    }

    if (details.isSuspended) {
      return res.status(404).json({ msg: "Handyman temporarily unavailable" });
    }

    res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      profileImage: user.profileImage,
      profession: details.profession,
      price: details.price,
      rating: details.rating,
      verified: details.verified,
      isAvailable: details.isAvailable,
      bio: details.bio,
      experienceYears: details.experienceYears,
      gallery: details.gallery || [],
      completedOrders: details.completedOrders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// =====================================================
// ========== HANDYMAN STATUS ROUTES ==========
// =====================================================

/**
 * @desc    Get handyman registration status
 * @route   GET /api/handyman/status
 * @access  Private (Handyman only)
 */
const getHandymanStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const handyman = await Handyman.findOne({ userId })
      .populate('userId', 'name email phone profileImage');
    
    if (!handyman) {
      return res.status(404).json({
        success: false,
        msg: 'بيانات الحرفي غير موجودة'
      });
    }

    const isActive = handyman.registrationStatus === 'approved' && 
                     !handyman.isSuspended && 
                     !handyman.deletedAt;

    res.status(200).json({
      success: true,
      status: handyman.registrationStatus,
      note: handyman.adminNote || handyman.rejectedReason || '',
      isActive: isActive,
      verified: handyman.verified,
      isSuspended: handyman.isSuspended,
      suspendedReason: handyman.suspendedReason,
      data: {
        handymanId: handyman._id,
        userId: handyman.userId,
        profession: handyman.profession,
        price: handyman.price,
        experienceYears: handyman.experienceYears,
        rating: handyman.rating,
        completedOrders: handyman.completedOrders,
        isAvailable: handyman.isAvailable,
        registeredAt: handyman.registeredAt,
        approvedAt: handyman.approvedAt,
        rejectedAt: handyman.rejectedAt
      }
    });

  } catch (error) {
    console.error('Error getting handyman status:', error);
    res.status(500).json({ 
      success: false,
      msg: 'Server error', 
      error: error.message 
    });
  }
};

/**
 * @desc    Get handyman full profile (authenticated)
 * @route   GET /api/handyman/profile
 * @access  Private (Handyman only, must be approved)
 */
const getHandymanFullProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const handyman = await Handyman.findOne({ userId })
      .populate('userId', 'name email phone profileImage location city');
    
    if (!handyman) {
      return res.status(404).json({
        success: false,
        msg: 'بيانات الحرفي غير موجودة'
      });
    }

    // Check if handyman is active
    if (handyman.registrationStatus === 'pending') {
      return res.status(403).json({
        success: false,
        msg: 'حسابك في انتظار موافقة الأدمن',
        status: 'pending'
      });
    }

    if (handyman.registrationStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        msg: `تم رفض حسابك: ${handyman.adminNote || handyman.rejectedReason || 'غير محدد'}`,
        status: 'rejected'
      });
    }

    if (handyman.isSuspended) {
      return res.status(403).json({
        success: false,
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : 'حسابك معلق مؤقتاً',
        status: 'suspended'
      });
    }

    res.status(200).json({
      success: true,
      data: handyman
    });

  } catch (error) {
    console.error('Error getting handyman full profile:', error);
    res.status(500).json({ 
      success: false,
      msg: 'Server error', 
      error: error.message 
    });
  }
};

// =====================================================
// ========== PROFILE UPDATE ROUTES ==========
// =====================================================

/**
 * @desc    Update handyman profile
 * @route   PUT /api/handyman/:id
 * @access  Private (Handyman only)
 */
const updateHandymanProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // Check authorization
    if (req.user.id !== id && req.user.role !== "admin") {
      return res.status(403).json({ 
        msg: "You can only update your own profile" 
      });
    }

    const { bio, price, gallery, isAvailable } = req.body;

    const handyman = await Handyman.findOne({ userId: id });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    // Check if handyman is active (approved and not suspended)
    if (handyman.registrationStatus !== 'approved') {
      return res.status(403).json({
        msg: handyman.registrationStatus === 'pending' 
          ? 'حسابك في انتظار الموافقة، لا يمكنك التحديث حالياً' 
          : 'تم رفض حسابك، لا يمكنك التحديث',
        status: handyman.registrationStatus
      });
    }

    if (handyman.isSuspended) {
      return res.status(403).json({
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : 'حسابك معلق مؤقتاً',
        status: 'suspended'
      });
    }

    // Update fields
    if (price !== undefined) handyman.price = parseFloat(price);
    if (bio !== undefined) handyman.bio = bio;
    if (gallery !== undefined) handyman.gallery = gallery;
    if (isAvailable !== undefined) handyman.isAvailable = isAvailable;

    await handyman.save();

    res.status(200).json({
      msg: "Profile updated successfully",
      handyman: {
        userId: handyman.userId,
        profession: handyman.profession,
        price: handyman.price,
        bio: handyman.bio,
        rating: handyman.rating,
        verified: handyman.verified,
        isAvailable: handyman.isAvailable,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

/**
 * @desc    Update handyman availability
 * @route   PATCH /api/handyman/:handymanId/availability
 * @access  Private (Handyman only)
 */
const updateAvailability = async (req, res) => {
  try {
    const { handymanId } = req.params;
    const { isAvailable } = req.body;

    // Check authorization
    if (req.user.id !== handymanId && req.user.role !== "admin") {
      return res.status(403).json({ 
        msg: "You can only update your own availability" 
      });
    }

    if (isAvailable === undefined) {
      return res.status(400).json({ msg: "isAvailable is required" });
    }

    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    // Check if handyman is active
    if (handyman.registrationStatus !== 'approved') {
      return res.status(403).json({
        msg: handyman.registrationStatus === 'pending' 
          ? 'حسابك في انتظار الموافقة' 
          : 'تم رفض حسابك',
        status: handyman.registrationStatus
      });
    }

    if (handyman.isSuspended) {
      return res.status(403).json({
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : 'حسابك معلق مؤقتاً',
        status: 'suspended'
      });
    }

    handyman.isAvailable = isAvailable;
    await handyman.save();

    res.status(200).json({
      msg: `Availability updated to ${isAvailable ? "available" : "unavailable"}`,
      isAvailable: handyman.isAvailable,
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ 
      msg: "Server error", 
      error: error.message 
    });
  }
};

/**
 * @desc    Toggle availability (alias for updateAvailability)
 * @route   PATCH /api/handyman/:handymanId/toggle-availability
 * @access  Private (Handyman only)
 */
const toggleAvailability = async (req, res) => {
  return updateAvailability(req, res);
};

// =====================================================
// ========== ANALYTICS ROUTES ==========
// =====================================================

/**
 * @desc    Get handyman analytics
 * @route   GET /api/handyman/:handymanId/analytics
 * @access  Private (Handyman only)
 */
const getHandymanAnalytics = async (req, res) => {
  try {
    const { handymanId } = req.params;

    // Check authorization
    if (req.user.id !== handymanId && req.user.role !== "admin") {
      return res.status(403).json({ 
        msg: "You can only view your own analytics" 
      });
    }

    // Get handyman info first to check status
    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    // Order statistics
    const totalOrders = await Order.countDocuments({ handymanId });
    const completedOrders = await Order.countDocuments({
      handymanId,
      status: "completed",
    });
    const pendingOrders = await Order.countDocuments({
      handymanId,
      status: "pending",
    });
    const cancelledOrders = await Order.countDocuments({
      handymanId,
      status: "cancelled",
    });

    // Total earnings from completed orders
    const earningsResult = await Order.aggregate([
      {
        $match: {
          handymanId: new mongoose.Types.ObjectId(handymanId),
          status: "completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$netAmount" } } },
    ]);
    const totalEarnings = earningsResult[0]?.total || 0;

    // Rating statistics
    const ratingStats = await Order.aggregate([
      {
        $match: {
          handymanId: new mongoose.Types.ObjectId(handymanId),
          rating: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      totalEarnings,
      rating: handyman.rating || 0,
      avgRating: ratingStats[0]?.avgRating || 0,
      totalReviews: ratingStats[0]?.totalReviews || 0,
      isAvailable: handyman.isAvailable,
      walletBalance: handyman.walletBalance || 0,
      isSuspended: handyman.isSuspended || false,
      suspendedReason: handyman.suspendedReason || null,
      registrationStatus: handyman.registrationStatus,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ 
      msg: "Server error", 
      error: error.message 
    });
  }
};

// =====================================================
// ========== EXPORTS ==========
// =====================================================

module.exports = {
  getNearbyHandymen,
  getHandymanDetails,
  updateHandymanProfile,
  getHandymanAnalytics,
  toggleAvailability,
  getHandymanStatus,
  getHandymanFullProfile,
  updateAvailability,
};