// HerfyBackend/controllers/handymanController.js
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const Fine = require("../models/Fine");
const SettlementRequest = require("../models/SettlementRequest");
const mongoose = require("mongoose");
const { checkScheduleConflict } = require("./orderController");

// =====================================================
// ========== HELPER FUNCTIONS ==========
// =====================================================

const EARTH_RADIUS_M = 6371000;
const ASSUMED_AVG_SPEED_KMH = 30;
// MongoDB's spherical distance cannot exceed half the Earth's circumference.
const MAX_GEOSPHERE_DISTANCE_METERS = 20037508;

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
 * @desc    Get nearby handymen based on dynamic Base Location & Availability
 * @route   GET /api/handyman/nearby
 * @access  Public
 */
const getNearbyHandymen = async (req, res) => {
  try {
    const {
      lat,
      lng,
      radius = MAX_GEOSPHERE_DISTANCE_METERS,
      profession,
      sort = "distance",
      scheduledDate,
      expectedDuration,
      includeUnavailable = "false",
    } = req.query;

    if (lat === undefined || lng === undefined || lat === null || lng === null) {
      return res.status(400).json({
        msg: "Latitude and longitude are required",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const requestedRadius = Number(radius);

    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        msg: "Latitude must be between -90 and 90, and longitude between -180 and 180",
      });
    }

    if (!Number.isFinite(requestedRadius) || requestedRadius <= 0) {
      return res.status(400).json({
        msg: "Radius must be a positive number of meters",
      });
    }

    // `$near` uses Handyman.location's 2dsphere index. Cap a larger supplied
    // radius at the maximum valid spherical distance rather than passing an
    // invalid value to MongoDB.
    const effectiveRadius = Math.min(
      requestedRadius,
      MAX_GEOSPHERE_DISTANCE_METERS
    );

    // Build filter for approved, available, non-suspended handymen
    const handymanFilter = {
      registrationStatus: "approved",
      isSuspended: false,
      isAvailable: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          $maxDistance: effectiveRadius,
        },
      },
    };

    if (profession && profession.trim().length > 0) {
      handymanFilter.profession = profession.trim();
    }

    // MongoDB filters and returns candidates nearest-first through the
    // 2dsphere index. Haversine below is retained only for display distance
    // and optional smart-score normalization.
    const handymenDetails = await Handyman.find(handymanFilter)
      .populate("userId", "name email phone profileImage location address isBanned deletedAt")
      .lean();

    const candidates = [];

    for (const h of handymenDetails) {
      const user = h.userId;
      if (!user || user.isBanned || user.deletedAt) continue;

      // `$near` guarantees an indexed Handyman location. User.location is
      // populated for profile data but is not a discovery fallback because it
      // belongs to a different collection/index.
      const coords = h.location.coordinates;

      // Calculate distance from Handyman Base Location to Order Service Location
      let distance = null;
      let distanceKm = null;
      let distanceText = null;
      let eta = null;

      if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        const meters = haversineDistanceMeters([longitude, latitude], coords);
        distance = Math.round(meters);
        distanceKm = Number((meters / 1000).toFixed(1));
        distanceText = distance < 1000 ? `${distance} م` : `${distanceKm} كم`;
        eta = Math.max(1, Math.round((meters / 1000 / ASSUMED_AVG_SPEED_KMH) * 60));
      }

      // Schedule conflict check if appointment date is requested
      let isScheduleAvailable = true;
      let conflictDetails = null;

      if (scheduledDate) {
        const conflict = await checkScheduleConflict({
          handymanId: user._id,
          scheduledDate,
          expectedDuration: expectedDuration ? Number(expectedDuration) : null,
        });
        if (conflict.hasConflict) {
          isScheduleAvailable = false;
          conflictDetails = conflict.conflictDetails;
          if (includeUnavailable !== "true") {
            continue; // Exclude craftsmen with schedule conflicts
          }
        }
      }

      const addressStr = h.address || user.address || "";

      candidates.push({
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: addressStr,
        location: coords ? { type: "Point", coordinates: coords } : null,
        profileImage: user.profileImage,
        profession: h.profession,
        price: h.price,
        rating: h.rating || 0,
        verified: h.verified || false,
        isAvailable: h.isAvailable,
        isScheduleAvailable,
        conflictDetails,
        bio: h.bio || "",
        experienceYears: h.experienceYears || 0,
        distance,
        distanceKm,
        distanceText,
        eta,
        completedOrders: h.completedOrders || 0,
        acceptanceRate: h.acceptanceRate || 1.0,
      });
    }

    // Apply sorting
    if (sort === "distance" || !sort) {
      candidates.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    } else if (sort === "rating") {
      candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === "price") {
      candidates.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sort === "smart") {
      const DIST_WEIGHT = parseFloat(process.env.MATCHING_DISTANCE_WEIGHT) || 0.4;
      const RATING_WEIGHT = parseFloat(process.env.MATCHING_RATING_WEIGHT) || 0.4;
      const ACCEPT_WEIGHT = parseFloat(process.env.MATCHING_ACCEPTANCE_WEIGHT) || 0.2;
      const maxDistance = effectiveRadius;

      candidates.forEach((h) => {
        const normDist = h.distance ? Math.max(0, (maxDistance - h.distance) / maxDistance) : 0;
        const normRating = (h.rating || 0) / 5.0;
        const normAccept = h.acceptanceRate;
        h.smartScore = normDist * DIST_WEIGHT + normRating * RATING_WEIGHT + normAccept * ACCEPT_WEIGHT;
      });
      candidates.sort((a, b) => b.smartScore - a.smartScore);
    }

    res.status(200).json({
      count: candidates.length,
      handymen: candidates,
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
    if (details.registrationStatus !== "approved") {
      return res.status(404).json({ msg: "Handyman not available" });
    }

    if (details.isSuspended) {
      return res.status(404).json({ msg: "Handyman temporarily unavailable" });
    }

    res.status(200).json({
      id: user._id,
      name: user.name,
      address: details.address || user.address || "",
      city: details.city || user.city || "",
      area: details.area || user.area || "",
      location: details.location || user.location || null,
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

    const handyman = await Handyman.findOne({ userId }).populate(
      "userId",
      "name email phone profileImage address location"
    );

    if (!handyman) {
      return res.status(404).json({
        success: false,
        msg: "بيانات الحرفي غير موجودة",
      });
    }

    const isActive =
      handyman.registrationStatus === "approved" &&
      !handyman.isSuspended &&
      !handyman.deletedAt;

    res.status(200).json({
      success: true,
      status: handyman.registrationStatus,
      note: handyman.adminNote || handyman.rejectedReason || "",
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
        address: handyman.address || handyman.userId?.address || "",
        city: handyman.city || handyman.userId?.city || "",
        area: handyman.area || handyman.userId?.area || "",
        location: handyman.location || handyman.userId?.location || null,
        registeredAt: handyman.registeredAt,
        approvedAt: handyman.approvedAt,
        rejectedAt: handyman.rejectedAt,
      },
    });
  } catch (error) {
    console.error("Error getting handyman status:", error);
    res.status(500).json({
      success: false,
      msg: "Server error",
      error: error.message,
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

    const handyman = await Handyman.findOne({ userId }).populate(
      "userId",
      "name email phone profileImage location address"
    );

    if (!handyman) {
      return res.status(404).json({
        success: false,
        msg: "بيانات الحرفي غير موجودة",
      });
    }

    if (handyman.registrationStatus === "pending") {
      return res.status(403).json({
        success: false,
        msg: "حسابك في انتظار موافقة الأدمن",
        status: "pending",
      });
    }

    if (handyman.registrationStatus === "rejected") {
      return res.status(403).json({
        success: false,
        msg: `تم رفض حسابك: ${handyman.adminNote || handyman.rejectedReason || "غير محدد"}`,
        status: "rejected",
      });
    }

    if (handyman.isSuspended) {
      return res.status(403).json({
        success: false,
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : "حسابك معلق مؤقتاً",
        status: "suspended",
      });
    }

    res.status(200).json({
      success: true,
      data: handyman,
    });
  } catch (error) {
    console.error("Error getting handyman full profile:", error);
    res.status(500).json({
      success: false,
      msg: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// ========== PROFILE UPDATE ROUTES ==========
// =====================================================

/**
 * @desc    Update handyman profile including Base Location & Address
 * @route   PUT /api/handyman/:id
 * @access  Private (Handyman only)
 */
const updateHandymanProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // Check authorization: handyman can only update their own profile, or admin
    if (req.user.id !== id && req.user.role !== "admin") {
      return res.status(403).json({
        msg: "You can only update your own profile",
      });
    }

    const { bio, price, gallery, isAvailable, address, location, city, area } = req.body;

    const handyman = await Handyman.findOne({ userId: id });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    // Check if handyman is active (approved and not suspended)
    if (handyman.registrationStatus !== "approved") {
      return res.status(403).json({
        msg:
          handyman.registrationStatus === "pending"
            ? "حسابك في انتظار الموافقة، لا يمكنك التحديث حالياً"
            : "تم رفض حسابك، لا يمكنك التحديث",
        status: handyman.registrationStatus,
      });
    }

    if (handyman.isSuspended) {
      return res.status(403).json({
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : "حسابك معلق مؤقتاً",
        status: "suspended",
      });
    }

    // Update fields
    if (price !== undefined) handyman.price = parseFloat(price);
    if (bio !== undefined) handyman.bio = bio;
    if (gallery !== undefined) handyman.gallery = gallery;
    if (isAvailable !== undefined) handyman.isAvailable = isAvailable;
    if (address !== undefined) handyman.address = address;
    if (city !== undefined) handyman.city = city;
    if (area !== undefined) handyman.area = area;

    // Handle Base Location coordinates update
    const userUpdate = {};
    if (address !== undefined) userUpdate.address = address;
    if (city !== undefined) userUpdate.city = city;
    if (area !== undefined) userUpdate.area = area;

    if (location) {
      let coords = null;
      if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        coords = location.coordinates;
      } else if (Array.isArray(location) && location.length === 2) {
        coords = location;
      }
      if (coords) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          handyman.location = { type: "Point", coordinates: [lng, lat] };
          userUpdate.location = { type: "Point", coordinates: [lng, lat] };
        }
      }
    }

    if (Object.keys(userUpdate).length > 0) {
      await User.findByIdAndUpdate(id, userUpdate);
    }

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
        address: handyman.address,
        city: handyman.city,
        area: handyman.area,
        location: handyman.location,
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
        msg: "You can only update your own availability",
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
    if (handyman.registrationStatus !== "approved") {
      return res.status(403).json({
        msg: handyman.registrationStatus === "pending" ? "حسابك في انتظار الموافقة" : "تم رفض حسابك",
        status: handyman.registrationStatus,
      });
    }

    if (handyman.isSuspended) {
      return res.status(403).json({
        msg: handyman.suspendedReason ? `حسابك معلق: ${handyman.suspendedReason}` : "حسابك معلق مؤقتاً",
        status: "suspended",
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
      error: error.message,
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
        msg: "You can only view your own analytics",
      });
    }

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

    const completedOrdersList = await Order.find({
      handymanId,
      status: "completed",
    });

    const totalEarnings = completedOrdersList.reduce((acc, order) => {
      return acc + (order.totalPrice || order.price || 0);
    }, 0);

    const monthlyEarnings = completedOrdersList
      .filter((order) => {
        const orderDate = new Date(order.createdAt);
        const now = new Date();
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      })
      .reduce((acc, order) => {
        return acc + (order.totalPrice || order.price || 0);
      }, 0);

    // Calculate cancellation rate accurately
    const cancellationRate = totalOrders > 0 ? Number(((cancelledOrders / totalOrders) * 100).toFixed(1)) : 0;

    // Check unpaid fines and pending settlement request
    const [unpaidFines, pendingSettlement, userDoc, totalFinesCount] = await Promise.all([
      Fine.find({ handymanId, status: { $in: ['unpaid', 'pending'] } }),
      SettlementRequest.findOne({ handymanId, status: 'pending' }).sort({ createdAt: -1 }),
      User.findById(handymanId),
      Fine.countDocuments({ handymanId }),
    ]);

    const fineAmountSum = unpaidFines.reduce((s, f) => s + (f.amount || 0), 0);
    const outstandingPenalty = unpaidFines.length > 0 ? fineAmountSum : Math.max(handyman.penaltyAmount || 0, userDoc?.penaltyAmount || 0);
    const penaltyCount = handyman.penaltyCount || userDoc?.penaltyCount || totalFinesCount || 0;

    // Calculate rating breakdown
    const ratings = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: 0,
      percentage: 0,
    }));

    res.status(200).json({
      orders: {
        total: totalOrders,
        completed: completedOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders,
      },
      cancelledOrders,
      cancellationRate,
      monthlyCancellationCount: handyman.monthlyCancellationCount || 0,
      penaltyCount,
      penaltyAmount: outstandingPenalty,
      hasPendingSettlement: !!pendingSettlement,
      pendingSettlement,
      earnings: {
        total: totalEarnings,
        monthly: monthlyEarnings,
      },
      ratings: {
        average: handyman.rating || 0,
        total: completedOrders,
        breakdown: ratings,
      },
      metrics: {
        acceptanceRate: handyman.acceptanceRate || 1.0,
        completionRate: totalOrders > 0 ? completedOrders / totalOrders : 1.0,
        cancellationRate,
        responseRate: 0.95,
      },
      wallet: {
        balance: handyman.walletBalance || 0,
        pendingEarnings: handyman.pendingEarnings || 0,
        totalPaidOut: handyman.totalPaidOut || 0,
        penaltyAmount: outstandingPenalty,
        penaltyCount,
      },
      cancellation: {
        monthlyCancellationCount: handyman.monthlyCancellationCount || 0,
      },
      status: {
        isSuspended: handyman.isSuspended,
        suspendedReason: handyman.suspendedReason,
        registrationStatus: handyman.registrationStatus,
      },
    });
  } catch (error) {
    console.error("Error getting handyman analytics:", error);
    res.status(500).json({
      msg: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get handyman monthly statistics
 * @route   GET /api/handyman/monthly-stats
 * @access  Private (Handyman only)
 */
const getHandymanMonthlyStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const handyman = await Handyman.findOne({ userId });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (
      handyman.monthlyCancellationMonth !== currentMonth ||
      handyman.monthlyCancellationYear !== currentYear
    ) {
      handyman.monthlyCancellationCount = 0;
      handyman.monthlyCancellationMonth = currentMonth;
      handyman.monthlyCancellationYear = currentYear;
      await handyman.save();
    }

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    const monthlyOrders = await Order.find({
      handymanId: userId,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    });

    const totalOrders = monthlyOrders.length;
    const completedOrders = monthlyOrders.filter((o) => o.status === "completed").length;
    const cancelledOrders = handyman.monthlyCancellationCount;

    // Grant trusted/verified status if target reached
    let justVerified = false;
    if (completedOrders >= 10 && !handyman.verified) {
      handyman.verified = true;
      await handyman.save();
      justVerified = true;
    }

    const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

    res.status(200).json({
      month: currentMonth + 1,
      year: currentYear,
      totalOrders,
      completedOrders,
      cancelledOrders,
      cancellationRate: Number(cancellationRate.toFixed(1)),
      penaltyAmount: handyman.penaltyAmount || 0,
      penaltyCount: handyman.penaltyCount || 0,
      isSuspended: handyman.isSuspended,
      suspendedReason: handyman.suspendedReason,
      verified: handyman.verified,
      justVerified
    });
  } catch (error) {
    console.error("Error getting monthly stats:", error);
    res.status(500).json({
      msg: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getNearbyHandymen,
  getHandymanDetails,
  getHandymanStatus,
  getHandymanFullProfile,
  updateHandymanProfile,
  updateAvailability,
  toggleAvailability,
  getHandymanAnalytics,
  getHandymanMonthlyStats,
};
