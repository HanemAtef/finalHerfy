const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Order = require("../models/Order");
const mongoose = require("mongoose");

// FIX (M8): distance/eta were declared on every getNearbyHandymen response
// but hardcoded to null — no $near projection or ETA lookup ever populated
// them. This is a local haversine estimate (not the full TomTom-backed
// routing feature, which is a separate unwired feature — see the audit's
// G-5 item), but it means the fields the frontend already reads carry real
// values instead of always showing nothing.
const EARTH_RADIUS_M = 6371000;
const ASSUMED_AVG_SPEED_KMH = 30; // rough urban driving average

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
const getNearbyHandymen = async (req, res) => {
  try {
    const { lat, lng, radius = 8000, profession, sort } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        msg: "Latitude and longitude are required",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

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

    const userIds = nearbyUsers.map((u) => u._id);
    const handymenDetails = await Handyman.find({
      userId: { $in: userIds },
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

        if (!details.isAvailable) {
          return null;
        }

        // FIX (M8): real values instead of hardcoded null.
        let distance = null;
        let eta = null;
        if (
          Array.isArray(user.location?.coordinates) &&
          user.location.coordinates.length === 2
        ) {
          const meters = haversineDistanceMeters(
            [longitude, latitude],
            user.location.coordinates,
          );
          distance = Math.round(meters); // meters
          eta = Math.max(
            1,
            Math.round((meters / 1000 / ASSUMED_AVG_SPEED_KMH) * 60),
          ); // minutes
        }

        return {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          location: user.location,
          profession: details.profession,
          price: details.price,
          rating: details.rating,
          verified: details.verified,
          isAvailable: details.isAvailable,
          bio: details.bio,
          experienceYears: details.experienceYears,
          distance,
          eta,
        };
      })
      .filter(Boolean);

    if (sort === "rating") {
      handymenList.sort((a, b) => b.rating - a.rating);
    }

    if (sort === "price") {
      handymenList.sort((a, b) => a.price - b.price);
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
////////////////////////////////////
// get single handyman details by ID

const getHandymanDetails = async (req, res) => {
  try {
    //get handyman details by import
    const { id } = req.params;
    const user = await User.findOne({ _id: id, role: "handyman" });
    if (!user) {
      return res.status(404).json({ msg: "Handyman not found" });
    }
    const details = await Handyman.findOne({ userId: user._id });
    //res
    res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      profession: details?.profession,
      price: details?.price,
      rating: details?.rating,
      verified: details?.verified,
      isAvailable: details?.isAvailable,
      bio: details?.bio,
      experienceYears: details?.experienceYears,
      gallery: details?.gallery || [],
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

////////////////////////////////////
// update herfy profile
const updateHandymanProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id !== id && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ msg: "You can only update your own profile" });
    }

    const { bio, price, gallery, isAvailable } = req.body;

    const handyman = await Handyman.findOne({ userId: id });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    if (price !== undefined) handyman.price = price;
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

//stats for handyman
const getHandymanAnalytics = async (req, res) => {
  try {
    const { handymanId } = req.params;

    //check for roles
    if (req.user.id !== handymanId && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ msg: "You can only view your own analytics" });
    }

    //orders nums
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

    // totAL profits from completed orders
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

    // handyman info
    const handyman = await Handyman.findOne({ userId: handymanId });

    res.status(200).json({
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      totalEarnings,
      rating: handyman?.rating || 0,
      isAvailable: handyman?.isAvailable,
      // Wallet/commission debt is only exposed here (an access-controlled,
      // "own analytics only" endpoint) — never on the public handyman
      // profile — since it reveals a craftsman's owed commission.
      walletBalance: handyman?.walletBalance || 0,
      isSuspended: handyman?.isSuspended || false,
      suspendedReason: handyman?.suspendedReason || null,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

//change the availble mode
const toggleAvailability = async (req, res) => {
  try {
    const { handymanId } = req.params;

    // roles
    if (req.user.id !== handymanId && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ msg: "You can only update your own availability" });
    }

    const { isAvailable } = req.body;

    if (isAvailable === undefined) {
      return res.status(400).json({ msg: "isAvailable is required" });
    }

    const handyman = await Handyman.findOne({ userId: handymanId });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    handyman.isAvailable = isAvailable;
    await handyman.save();

    res.status(200).json({
      msg: `Availability updated to ${isAvailable ? "available" : "unavailable"}`,
      isAvailable: handyman.isAvailable,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};
module.exports = {
  getNearbyHandymen,
  getHandymanDetails,
  updateHandymanProfile,
  getHandymanAnalytics,
  toggleAvailability,
};
