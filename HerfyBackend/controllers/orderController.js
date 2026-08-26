const Order = require("../models/Order");
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const Fine = require("../models/Fine");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const stripe = require("../config/stripe");
const { createNotification } = require("./notificationController");
const { cleanupThrottle } = require("../socket/liveTrackingThrottle");
const {
  WALLET_DEBT_SUSPENSION_REASON,
  ORDER_STATUS,
  GEOFENCE_ALLOWED_RADIUS_METERS,
  normalizeOrderStatus,
  isAllowedStatusTransition,
} = require("../utils/constants");
const { calculateRoute } = require("../utils/tomtom");

/**
 * Helper: Check for schedule conflicts for a craftsman.
 * Validates whether [scheduledDate, scheduledDate + expectedDuration] overlaps with
 * any of the craftsman's active orders (accepted, price_confirmed, in-progress, arrived).
 *
 * Interval overlap rule: (Start_A < End_B) && (Start_B < End_A)
 */
const checkScheduleConflict = async ({
  handymanId,
  scheduledDate,
  expectedDuration = null,
  excludeOrderId = null,
  session = null,
}) => {
  const newStart = new Date(scheduledDate).getTime();
  if (isNaN(newStart)) {
    return { hasConflict: false };
  }
  const durationHours = expectedDuration ? Math.max(0.5, Number(expectedDuration)) : 1;
  const newEnd = newStart + durationHours * 60 * 60 * 1000;

  const query = {
    handymanId: new mongoose.Types.ObjectId(handymanId),
    status: { $in: ["accepted", "price_confirmed", "in-progress", "arrived"] },
  };
  if (excludeOrderId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeOrderId) };
  }

  let ordersQuery = Order.find(query);
  if (session) {
    ordersQuery = ordersQuery.session(session);
  }
  const existingOrders = await ordersQuery;

  const now = Date.now();
  for (const existing of existingOrders) {
    const existingStart = new Date(existing.scheduledDate || existing.createdAt).getTime();
    const existingDurationHours = existing.expectedDuration ? Math.max(0.5, Number(existing.expectedDuration)) : 1;
    let existingEnd = existingStart + existingDurationHours * 60 * 60 * 1000;

    // If order is currently in-progress or arrived and past its planned duration,
    // its effective end extends to at least current time.
    if (["in-progress", "arrived"].includes(existing.status) && existingEnd < now) {
      existingEnd = now;
    }

    // Overlap test: (newStart < existingEnd) && (existingStart < newEnd)
    if (newStart < existingEnd && existingStart < newEnd) {
      return {
        hasConflict: true,
        conflictingOrder: existing,
        conflictDetails: {
          conflictingOrderId: existing._id,
          existingStart: new Date(existingStart),
          existingEnd: new Date(existingEnd),
          requestedStart: new Date(newStart),
          requestedEnd: new Date(newEnd),
        },
      };
    }
  }

  return { hasConflict: false };
};

// ========== 1. create order ==========
const createOrder = async (req, res) => {
  try {
    const {
      handymanId,
      profession,
      description,
      images,
      scheduledDate,
      expectedDuration,
      estimatedPrice,
      customerLocation,
      orderLocation,
      isEmergency,
    } = req.body;

    let isEmergencyBool = false;
    if (isEmergency === true || isEmergency === "true" || isEmergency === 1 || isEmergency === "1") {
      isEmergencyBool = true;
    }

    const customer = await User.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ msg: "Customer not found" });
    }

    if (customer.penaltyAmount && customer.penaltyAmount > 0) {
      return res.status(403).json({
        msg: "You have an outstanding penalty of " + customer.penaltyAmount + " EGP. Please settle it before creating a new order.",
        penaltyAmount: customer.penaltyAmount,
      });
    }

    const handyman = await User.findOne({ _id: handymanId, role: "handyman" });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
    }

    if (handymanId === req.user.id) {
      return res.status(400).json({ msg: "You cannot create an order for yourself" });
    }

    const handymanProfile = await Handyman.findOne({
      userId: handymanId,
    });

    if (!handymanProfile || !handymanProfile.isAvailable) {
      return res.status(400).json({
        msg: "This handyman is currently unavailable.",
      });
    }

    const locationPayload = orderLocation || customerLocation;
    let customerCoords = null;
    if (Array.isArray(locationPayload?.coordinates) && locationPayload.coordinates.length === 2) {
      customerCoords = [Number(locationPayload.coordinates[0]), Number(locationPayload.coordinates[1])];
    } else if (locationPayload?.longitude != null && locationPayload?.latitude != null) {
      customerCoords = [Number(locationPayload.longitude), Number(locationPayload.latitude)];
    } else if (Array.isArray(customer?.location?.coordinates) && customer.location.coordinates.length === 2) {
      customerCoords = customer.location.coordinates;
    }

    // Validate coordinates
    if (
      !customerCoords ||
      customerCoords.length !== 2 ||
      isNaN(customerCoords[0]) ||
      isNaN(customerCoords[1]) ||
      customerCoords[1] < -90 ||
      customerCoords[1] > 90 ||
      customerCoords[0] < -180 ||
      customerCoords[0] > 180
    ) {
      return res.status(400).json({
        msg: "إحداثيات موقع الخدمة غير صحيحة. يرجى تزويد خط العرض وخط الطول بشكل صحيح.",
      });
    }

    const now = new Date();

    // Distance & Travel Time Validation:
    let handymanCoords = null;
    if (Array.isArray(handymanProfile?.location?.coordinates) && handymanProfile.location.coordinates.length === 2) {
      handymanCoords = handymanProfile.location.coordinates;
    } else if (Array.isArray(handyman?.location?.coordinates) && handyman.location.coordinates.length === 2) {
      handymanCoords = handyman.location.coordinates;
    }

    let distanceKm = null;
    let travelTimeMinutes = 10; // baseline travel time

    if (
      handymanCoords &&
      customerCoords &&
      handymanCoords[0] !== 0 &&
      handymanCoords[1] !== 0 &&
      customerCoords[0] !== 0 &&
      customerCoords[1] !== 0
    ) {
      const [hLng, hLat] = handymanCoords;
      const [cLng, cLat] = customerCoords;

      const distanceMeters = calculateRoute
        ? ((cLat - hLat) ** 2 + (cLng - hLng) ** 2) // placeholder for formula
        : 0;

      const R = 6371000;
      const dLat = ((cLat - hLat) * Math.PI) / 180;
      const dLon = ((cLng - hLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((hLat * Math.PI) / 180) *
          Math.cos((cLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const directDistMeters = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceKm = directDistMeters / 1000;

      travelTimeMinutes = Math.max(5, Math.round((distanceKm / 30) * 60));

      try {
        const routeData = await calculateRoute(
          { lat: hLat, lng: hLng },
          { lat: cLat, lng: cLng }
        );
        if (routeData && Number.isFinite(routeData.eta) && routeData.eta > 0) {
          travelTimeMinutes = Math.round(routeData.eta);
        }
      } catch (routeErr) {
        console.warn('[ORDER] Route ETA calculation fallback:', routeErr.message);
      }
    }

    const safetyBufferMinutes = 15;
    const requiredLeadMinutes = travelTimeMinutes + safetyBufferMinutes;
    const minAllowedTime = new Date(now.getTime() + requiredLeadMinutes * 60 * 1000);

    let orderScheduledDate = minAllowedTime;

    if (scheduledDate) {
      orderScheduledDate = new Date(scheduledDate);

      // Reject past date/time (allow 2 min buffer for network request lag)
      if (orderScheduledDate.getTime() < now.getTime() - 2 * 60 * 1000) {
        return res.status(400).json({
          msg: "لا يمكن حجز موعد في وقت سابق. يرجى اختيار موعد قادم.",
        });
      }

      // Validation: Earliest allowed appointment time = Current time + travel time + safety buffer
      if (orderScheduledDate.getTime() < minAllowedTime.getTime() - 2 * 60 * 1000) {
        const timeOpts = { hour: '2-digit', minute: '2-digit' };
        const minTimeStr = minAllowedTime.toLocaleTimeString('ar-EG', timeOpts);
        const minDateStr = minAllowedTime.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });

        return res.status(400).json({
          msg: `الوقت المحدد غير كافٍ لوصول الحرفي إلى موقعك${distanceKm ? ` (${distanceKm.toFixed(1)} كم)` : ''}. يستغرق الوصول حوالي (${travelTimeMinutes} دقيقة) بالإضافة إلى 15 دقيقة للتجهيز. أقرب موعد متاح هو: ${minTimeStr} (${minDateStr}).`,
          minAllowedTime: minAllowedTime.toISOString(),
          distanceKm: distanceKm ? Number(distanceKm.toFixed(1)) : null,
          travelTimeMinutes,
          requiredLeadMinutes,
        });
      }
    }

    const orderDuration = expectedDuration ? Number(expectedDuration) : null;

    // Check for schedule conflict with handyman's existing active orders
    const scheduleConflict = await checkScheduleConflict({
      handymanId,
      scheduledDate: orderScheduledDate,
      expectedDuration: orderDuration,
    });

    if (scheduleConflict.hasConflict) {
      return res.status(400).json({
        msg: "لا يمكن إرسال الطلب لوجود تعارض في المواعيد مع طلب آخر لدى الحرفي.",
        conflict: scheduleConflict.conflictDetails,
      });
    }

    let finalPrice = estimatedPrice || 0;
    let serviceAmount = finalPrice;
    let penaltyAmount = 0;
    let totalPrice = serviceAmount + penaltyAmount;

    const commissionRate = isEmergencyBool ? 15 : 10;
    const expectedEndTime = orderDuration
      ? new Date(orderScheduledDate.getTime() + orderDuration * 60 * 60 * 1000)
      : null;

    const resolvedAddress = locationPayload?.address || customer.address || "";
    const resolvedCity = locationPayload?.city || customer.city || "";
    const resolvedArea = locationPayload?.area || customer.area || "";

    const order = await Order.create({
      customerId: req.user.id,
      handymanId,
      profession,
      description,
      images,
      scheduledDate: orderScheduledDate,
      expectedDuration: orderDuration,
      expectedEndTime,
      estimatedPrice: finalPrice,
      serviceAmount,
      penaltyAmount,
      totalPrice,
      orderLocation: {
        type: "Point",
        coordinates: [customerCoords[0], customerCoords[1]],
        latitude: customerCoords[1],
        longitude: customerCoords[0],
        address: resolvedAddress,
        city: resolvedCity,
        area: resolvedArea,
      },
      customerLocation: {
        type: "Point",
        coordinates: [customerCoords[0], customerCoords[1]],
        address: resolvedAddress,
      },
      status: "pending",
      commissionRate,
      isEmergency: isEmergencyBool,
    });

    // Update handyman totalOffers
    handymanProfile.totalOffers += 1;
    handymanProfile.acceptanceRate = handymanProfile.acceptedOffers / handymanProfile.totalOffers;
    await handymanProfile.save();

    // ========== NOTIFICATION: New order to handyman ==========
    const io = req.app.get('io');
    await createNotification(
      io,
      handymanId,
      'order_created',
      ' New Order',
      `${customer.name} has sent you a new order: ${profession}`,
      { orderId: order._id, customerName: customer.name }
    );

    res.status(201).json({
      msg: isEmergencyBool ? "Emergency order created successfully" : "Order created successfully",
      order,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 2. get order ==========
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate("customerId", "name email phone")
      .populate("handymanId", "name email phone profession");

    if (!order) {
      return res.status(404).json({ msg: "Order not found" });
    }

    if (
      req.user.id !== order.customerId?._id?.toString() &&
      req.user.id !== order.handymanId?._id?.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ msg: "You are not authorized to view this order" });
    }

    if (['arrived', 'completed', 'cancelled', 'disputed'].includes(order.status)) {
      if (order.isHandymanOnTheWay || order.trackingStatus === 'active') {
        order.isHandymanOnTheWay = false;
        if (order.trackingStatus !== 'expired') {
          order.trackingStatus = 'stopped';
        }
        await order.save();
      }
    }

    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 3. get customer orders ==========
const getCustomerOrders = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page, limit } = req.query;

    if (req.user.id !== customerId && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You can only view your own orders" });
    }

    let ordersQuery = Order.find({ customerId })
      .populate("handymanId", "name profession")
      .sort({ createdAt: -1 });

    if (page && limit) {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;
      ordersQuery = ordersQuery.skip(skip).limit(limitNum);
    }

    const orders = await ordersQuery;
    const total = await Order.countDocuments({ customerId });

    res.status(200).json({
      msg: "Your Orders",
      data: orders,
      total,
      pagination: {
        total,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : total,
        totalPages: limit ? Math.ceil(total / parseInt(limit, 10)) : 1,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 4. get handyman orders ==========
const getHandymanOrders = async (req, res) => {
  try {
    const { handymanId } = req.params;

    if (req.user.id !== handymanId && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You can only view your own orders" });
    }

    const orders = await Order.find({ handymanId })
      .populate("customerId", "name email phone")
      .sort({ createdAt: -1 });

    res.status(200).json({
      msg: "Your Orders",
      data: orders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 5. update order status ==========
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, price } = req.body;

    const normalizedStatus = normalizeOrderStatus(status);
    const validStatuses = [
      "pending",
      "accepted",
      "scheduled",
      "price_confirmed",
      "on_the_way",
      "in-progress",
      "arrived",
      "completed",
      "cancelled",
      "disputed",
    ];

    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ msg: "Invalid status" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Order not found" });
    }

    const isCustomer = req.user.id === order.customerId?.toString();
    const isHandyman = req.user.id === order.handymanId?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isCustomer && !isHandyman && !isAdmin) {
      return res.status(403).json({ msg: "You are not authorized to update this order" });
    }

    const currentStatus = order.status;
    const currentNormalized = normalizeOrderStatus(currentStatus);

    if (currentNormalized === "completed") {
      return res.status(400).json({ msg: "Cannot update a completed order" });
    }

    if (currentNormalized === "cancelled") {
      return res.status(400).json({ msg: "Cannot update an already cancelled order" });
    }

    // Validate workflow transition unless admin
    if (!isAdmin && !isAllowedStatusTransition(currentNormalized, normalizedStatus)) {
      return res.status(400).json({
        msg: `انتقال غير مسموح لحالة الطلب من (${currentStatus}) إلى (${normalizedStatus}) وفقاً لقواعد العمل.`,
      });
    }

    // ========== Arrived Logic (50m Geo-Fencing Protected) ==========
    if (normalizedStatus === "arrived") {
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can mark order as arrived" });
      }

      // Verify Geo-Fencing on arrival with mandatory GPS coordinates
      const hLat = Number(req.body.latitude ?? req.body.handymanLocation?.latitude ?? req.body.coordinates?.[1] ?? req.body.handymanLocation?.coordinates?.[1]);
      const hLng = Number(req.body.longitude ?? req.body.handymanLocation?.longitude ?? req.body.coordinates?.[0] ?? req.body.handymanLocation?.coordinates?.[0]);

      if (!Number.isFinite(hLat) || !Number.isFinite(hLng) || hLat < -90 || hLat > 90 || hLng < -180 || hLng > 180) {
        return res.status(400).json({
          msg: "إحداثيات موقع الحرفي الحالية مطلوبة لتأكيد الوصول لموقع العميل.",
        });
      }

      const serviceCoords = (order.orderLocation?.coordinates && order.orderLocation.coordinates.length === 2 && (order.orderLocation.coordinates[0] !== 0 || order.orderLocation.coordinates[1] !== 0))
        ? order.orderLocation.coordinates
        : order.customerLocation?.coordinates;

      if (!serviceCoords || serviceCoords.length !== 2) {
        return res.status(400).json({ msg: "موقع الخدمة غير محدد في الطلب." });
      }

      const [cLng, cLat] = serviceCoords;
      const R = 6371000;
      const dLat = ((cLat - hLat) * Math.PI) / 180;
      const dLon = ((cLng - hLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((hLat * Math.PI) / 180) *
          Math.cos((cLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const distM = Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      const allowedRadius = Number(process.env.GEO_FENCE_RADIUS_METERS) || 50;

      if (distM > allowedRadius) {
        return res.status(400).json({
          msg: `لا يمكنك تأكيد الوصول الآن. يجب أن تكون على بعد ${allowedRadius} متر أو أقل من موقع العميل. المسافة الحالية: ${distM} متر.`,
          distance: distM,
          allowedRadius,
          isNearCustomer: false,
        });
      }

      order.status = "arrived";
      order.trackingStatus = "stopped";
      order.isHandymanOnTheWay = false;
      order.arrivedAt = new Date();
      order.arrivalLatitude = hLat;
      order.arrivalLongitude = hLng;
      order.arrivalDistance = distM;
      order.arrivedBy = req.user.id;
      if (order.liveTracking) {
        order.liveTracking.isActive = false;
        order.liveTracking.latitude = hLat;
        order.liveTracking.longitude = hLng;
        order.liveTracking.updatedAt = new Date();
      }

      // Auto-expire pending reschedule request on arrival
      if (order.rescheduleRequest && order.rescheduleRequest.status === "pending") {
        order.rescheduleRequest.status = "expired";
        order.rescheduleRequest.rejectedAt = new Date();
      }

      await order.save();
      orderAlreadySaved = true;

      const io = req.app.get('io');
      if (io) {
        io.to(id).emit('handymanArrived', {
          orderId: id,
          msg: 'الحرفي وصل إلى موقع العميل',
          distanceRemaining: 0,
          eta: 0,
          arrivalLatitude: hLat,
          arrivalLongitude: hLng,
          arrivalDistance: distM,
          arrivedAt: order.arrivedAt,
        });
      }
      await createNotification(
        io,
        order.customerId,
        'handyman_arrived',
        ' Handyman Arrived',
        `${req.user.name} has arrived at your location`,
        { orderId: order._id }
      );
      cleanupThrottle(id);
    }

    // ========== Cancelled Logic ==========
    if (normalizedStatus === "cancelled") {
      if (currentNormalized === "pending" && !isCustomer && !isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only customer or handyman can cancel pending order" });
      }

      const rawReason = req.body.cancellationReason || req.body.reason || req.body.cancelReason;
      const cancellationReasonText = (typeof rawReason === 'string' && rawReason.trim().length > 0)
        ? rawReason.trim()
        : (order.cancellationReason || null);

      order.status = "cancelled";
      order.cancelledAt = new Date();
      order.cancellationReason = cancellationReasonText;
      order.cancelledBy = isCustomer ? "customer" : isHandyman ? "handyman" : "admin";
      order.isHandymanOnTheWay = false;
      order.trackingStatus = "stopped";

      if (isHandyman) {
        const handyman = await Handyman.findOne({
          userId: order.handymanId,
        });

        if (handyman) {
          const now = new Date();

          if (
            handyman.monthlyCancellationMonth !== now.getMonth() ||
            handyman.monthlyCancellationYear !== now.getFullYear()
          ) {
            handyman.monthlyCancellationCount = 0;
            handyman.monthlyCancellationMonth = now.getMonth();
            handyman.monthlyCancellationYear = now.getFullYear();
          }

          if (["price_confirmed", "scheduled", "in-progress", "arrived", "on_the_way"].includes(currentNormalized)) {
            handyman.monthlyCancellationCount = (handyman.monthlyCancellationCount || 0) + 1;

            if (handyman.monthlyCancellationCount >= 3) {
              const existingFine = await Fine.findOne({ orderId: order._id, handymanId: order.handymanId });
              if (!existingFine) {
                handyman.penaltyCount = (handyman.penaltyCount || 0) + 1;
                handyman.penaltyAmount = (handyman.penaltyAmount || 0) + 50;

                await Fine.create({
                  handymanId: order.handymanId,
                  amount: 50,
                  reason: "إلغاء متكرر للطلبات",
                  status: "unpaid",
                  orderId: order._id,
                });

                const io = req.app.get("io");
                await createNotification(
                  io,
                  order.handymanId,
                  "penalty_warning",
                  "Penalty Warning",
                  "You have received a 50 EGP penalty due to repeated cancellations.",
                  {
                    orderId: order._id,
                    penaltyAmount: handyman.penaltyAmount,
                    penaltyCount: handyman.penaltyCount,
                  }
                );
              }
            }

            handyman.rating = Math.max(0, handyman.rating - 0.5);
            await handyman.save();
          }
        }
      }

      if (["price_confirmed", "scheduled", "in-progress", "arrived", "on_the_way"].includes(currentNormalized) && isCustomer) {
        const isTrackingExpired =
          order.trackingStatus === "expired" ||
          (order.trackingExpiresAt && Date.now() >= new Date(order.trackingExpiresAt).getTime());

        if (isTrackingExpired) {
          console.log('[ORDER] Tracking expired - penalty waived');
          order.penaltyAmount = 0;
        } else if (!order.penaltyAmount || order.penaltyAmount === 0) {
          // Progressive penalty: 50 + (penaltyCount * 10) - Idempotent
          const customer = await User.findById(order.customerId);
          if (customer) {
            const currentPenaltyCount = customer.penaltyCount || 0;
            const penaltyForCancellation = 50 + (currentPenaltyCount * 10);
            order.penaltyAmount = penaltyForCancellation;

            const updatedCustomer = await User.findByIdAndUpdate(
              order.customerId,
              {
                $inc: { penaltyCount: 1 },
                $set: { penaltyAmount: penaltyForCancellation },
              },
              { returnDocument: 'after' }
            );
            const io = req.app.get('io');
            await createNotification(
              io,
              order.customerId,
              'penalty_warning',
              ' Penalty Warning',
              `You have been charged a ${penaltyForCancellation} EGP penalty. Total penalized cancellations: ${updatedCustomer?.penaltyCount || 0}`,
              { orderId: order._id, penaltyCount: updatedCustomer?.penaltyCount || 0, penaltyAmount: penaltyForCancellation }
            );
          }
        }
      }

      order.trackingStatus = "stopped";
      order.isHandymanOnTheWay = false;
      cleanupThrottle(id);

      // Auto-cancel any pending reschedule request
      if (order.rescheduleRequest && order.rescheduleRequest.status === "pending") {
        order.rescheduleRequest.status = "cancelled";
        order.rescheduleRequest.rejectedAt = new Date();
      }

      await order.save();
      orderAlreadySaved = true;

      // ========== NOTIFICATION: Order cancelled ==========
      const io = req.app.get('io');
      const recipientId = isCustomer ? order.handymanId : order.customerId;
      await createNotification(
        io,
        recipientId,
        'order_cancelled',
        ' Order Cancelled',
        `${req.user.name} cancelled the order`,
        { orderId: order._id }
      );
    }

    // ========== Accept Logic ==========
    if (status === "accepted") {
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can accept order" });
      }

      if (currentStatus !== "pending") {
        return res.status(400).json({ msg: "Only a pending order can be accepted" });
      }

      if (isHandyman) {
        const handymanProfile = await Handyman.findOne({ userId: req.user.id });
        if (handymanProfile?.isSuspended) {
          return res.status(403).json({
            msg: `حسابك موقوف مؤقتاً (${handymanProfile.suspendedReason || 'رصيد عمولة مستحق'}). تواصل مع الدعم للتسوية.`,
          });
        }

        const handymanUser = await User.findById(req.user.id);
        const penaltyDue = Math.max(handymanProfile?.penaltyAmount || 0, handymanUser?.penaltyAmount || 0);

        if (penaltyDue > 0) {
          return res.status(403).json({
            msg: `لا يمكنك قبول طلبات جديدة لوجود غرامة مستحقة على حسابك بقيمة ${penaltyDue} ج.م بسبب إلغاء الطلبات. يرجى تسوية الغرامة أولاً.`,
            penaltyAmount: penaltyDue,
            penaltyCount: handymanProfile?.penaltyCount || handymanUser?.penaltyCount || 0,
          });
        }
      }

      // Check if handyman already has an active ongoing order
      const activeOrder = await Order.findOne({
        handymanId: order.handymanId,
        _id: { $ne: order._id },
        status: { $in: ["accepted", "price_confirmed", "in-progress", "arrived"] },
      });

      if (activeOrder) {
        return res.status(400).json({
          msg: "لديك طلب نشط بالفعل قيد التنفيذ. يجب إكمال الطلب الحالي قبل قبول طلب جديد.",
          activeOrderId: activeOrder._id,
        });
      }

      if (price !== undefined) {
        order.price = price;
        order.serviceAmount = price;
        order.totalPrice = price + (order.penaltyAmount || 0);
      }

      if (req.body.expectedDuration !== undefined && req.body.expectedDuration !== null) {
        const dur = Number(req.body.expectedDuration);
        if (dur > 0) {
          order.expectedDuration = dur;
          order.expectedEndTime = new Date(new Date(order.scheduledDate).getTime() + dur * 60 * 60 * 1000);
        }
      }

      order.status = "accepted";

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          // Re-check scheduling conflicts atomically within transaction
          const conflict = await checkScheduleConflict({
            handymanId: order.handymanId,
            scheduledDate: order.scheduledDate,
            expectedDuration: order.expectedDuration,
            excludeOrderId: order._id,
            session,
          });

          if (conflict.hasConflict) {
            const conflictError = new Error("SCHEDULE_CONFLICT");
            conflictError.isConflict = true;
            conflictError.details = conflict.conflictDetails;
            throw conflictError;
          }

          await order.save({ session });
        });
        orderAlreadySaved = true;
      } catch (txErr) {
        if (txErr.isConflict) {
          return res.status(400).json({
            msg: "لا يمكن قبول الطلب لوجود تعارض في المواعيد مع طلب آخر مجدول.",
            conflict: txErr.details,
          });
        }
        // Standalone Mongo fallback
        console.log("Accept transaction unavailable, falling back:", txErr.message);
        const conflict = await checkScheduleConflict({
          handymanId: order.handymanId,
          scheduledDate: order.scheduledDate,
          expectedDuration: order.expectedDuration,
          excludeOrderId: order._id,
        });
        if (conflict.hasConflict) {
          return res.status(400).json({
            msg: "لا يمكن قبول الطلب لوجود تعارض في المواعيد مع طلب آخر مجدول.",
            conflict: conflict.conflictDetails,
          });
        }
        await order.save();
        orderAlreadySaved = true;
      } finally {
        session.endSession();
      }

      // ========== NOTIFICATION: Order accepted ==========
      const io = req.app.get('io');
      await createNotification(
        io,
        order.customerId,
        'order_accepted',
        ' Order Accepted',
        `${req.user.name} accepted your order`,
        { orderId: order._id, handymanName: req.user.name }
      );

      if (isHandyman) {
        const handymanProfile = await Handyman.findOne({ userId: req.user.id });
        if (handymanProfile) {
          handymanProfile.acceptedOffers += 1;
          if (handymanProfile.totalOffers > 0) {
            handymanProfile.acceptanceRate = handymanProfile.acceptedOffers / handymanProfile.totalOffers;
          }
          await handymanProfile.save();
        }
      }
    }

    // ========== In-Progress Logic (Geo-Fencing Protected) ==========
    if (normalizedStatus === "in-progress") {
      if (!["price_confirmed", "scheduled", "arrived"].includes(currentNormalized)) {
        return res.status(400).json({ msg: "Order must be arrived before starting work" });
      }
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can start work" });
      }

      // Ensure craftsman does not have another active order currently physically being worked on on-site
      const activeWorkOrders = await Order.find({
        handymanId: order.handymanId,
        _id: { $ne: order._id },
        status: { $in: ["in-progress", "arrived"] },
      });

      if (activeWorkOrders.length > 0) {
        return res.status(400).json({
          msg: "لديك طلب آخر قيد التنفيذ حالياً. يرجى إكماله أولاً.",
          activeOrderId: activeWorkOrders[0]._id,
        });
      }

      // Server-Side Geo-Fencing Verification
      const hLat = Number(req.body.latitude ?? req.body.handymanLocation?.latitude ?? req.body.coordinates?.[1] ?? req.body.handymanLocation?.coordinates?.[1]);
      const hLng = Number(req.body.longitude ?? req.body.handymanLocation?.longitude ?? req.body.coordinates?.[0] ?? req.body.handymanLocation?.coordinates?.[0]);

      if (!Number.isFinite(hLat) || !Number.isFinite(hLng) || hLat < -90 || hLat > 90 || hLng < -180 || hLng > 180) {
        return res.status(400).json({
          msg: "إحداثيات موقع الحرفي الحالي مطلوبة للتحقق من التواجد في موقع العميل قبل بدء التنفيذ.",
        });
      }

      const serviceCoords = (order.orderLocation?.coordinates && order.orderLocation.coordinates.length === 2 && (order.orderLocation.coordinates[0] !== 0 || order.orderLocation.coordinates[1] !== 0))
        ? order.orderLocation.coordinates
        : order.customerLocation?.coordinates;

      if (!serviceCoords || serviceCoords.length !== 2) {
        return res.status(400).json({ msg: "موقع الخدمة غير محدد في الطلب." });
      }

      const [cLng, cLat] = serviceCoords;
      const R = 6371000; // Earth radius in meters
      const dLat = ((cLat - hLat) * Math.PI) / 180;
      const dLon = ((cLng - hLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((hLat * Math.PI) / 180) *
          Math.cos((cLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const serverCalculatedDistance = Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

      const allowedRadius = Number(process.env.GEO_FENCE_RADIUS_METERS) || 50;

      if (serverCalculatedDistance > allowedRadius) {
        return res.status(400).json({
          msg: `لا يمكنك بدء التنفيذ الآن. يجب أن تصل إلى موقع العميل أولاً. المسافة الحالية: ${serverCalculatedDistance} متر (الحد المسموح: ${allowedRadius} متر).`,
          distance: serverCalculatedDistance,
          allowedRadius,
          isNearCustomer: false,
        });
      }

      order.status = "in-progress";
      order.executionStartedAt = new Date();
      order.executionStartLatitude = hLat;
      order.executionStartLongitude = hLng;
      order.executionStartDistance = serverCalculatedDistance;
      order.startedBy = req.user.id;
    }

    // ========== Completed Logic ==========
    if (normalizedStatus === "completed") {
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can complete order" });
      }

      if (!["in-progress", "arrived"].includes(currentNormalized)) {
        return res.status(400).json({ msg: "Order must be in-progress or arrived before it can be completed" });
      }

      const { completionImage } = req.body;
      if (!completionImage) {
        return res.status(400).json({ msg: "Completion proof image is required" });
      }
      order.completionImage = completionImage;

      const commissionRate = order.commissionRate || 10;
      const commissionAmount = (order.price * commissionRate) / 100;
      const netAmount = order.price - commissionAmount;

      order.commissionAmount = commissionAmount;
      order.netAmount = netAmount;

      const handymanDoc = await Handyman.findOne({ userId: order.handymanId });
      if (handymanDoc) {
        handymanDoc.completedOrders = (handymanDoc.completedOrders || 0) + 1;
        handymanDoc.isAvailable = true;
        const isVerified = (handymanDoc.completedOrders >= 10) && ((handymanDoc.rating || 0) >= 4.5);
        handymanDoc.verified = isVerified;
        await handymanDoc.save();
      }

      order.status = "completed";
      order.completedAt = new Date();
      order.trackingStatus = "stopped";
      order.isHandymanOnTheWay = false;
      cleanupThrottle(id);

      // Auto-expire pending reschedule request when order completes
      if (order.rescheduleRequest && order.rescheduleRequest.status === "pending") {
        order.rescheduleRequest.status = "expired";
        order.rescheduleRequest.rejectedAt = new Date();
      }

      await order.save();
      orderAlreadySaved = true;
      console.log(`[ORDER] Order ${order._id} completed and saved. Status: ${order.status}`);

      // ========== NOTIFICATION: Order completed ==========
      const io = req.app.get('io');
      await createNotification(
        io,
        order.customerId,
        'order_completed',
        ' Order Completed',
        `${req.user.name} completed your order`,
        { orderId: order._id }
      );
    }

    if (!orderAlreadySaved) {
      order.status = normalizedStatus;
      if (['arrived', 'completed', 'cancelled', 'disputed', 'in-progress'].includes(normalizedStatus)) {
        order.isHandymanOnTheWay = false;
        if (order.trackingStatus !== 'expired') {
          order.trackingStatus = 'stopped';
        }
        // Auto-expire pending reschedule request on any non-scheduled status
        if (order.rescheduleRequest && order.rescheduleRequest.status === "pending") {
          order.rescheduleRequest.status = normalizedStatus === 'cancelled' ? 'cancelled' : 'expired';
          order.rescheduleRequest.rejectedAt = new Date();
        }
      }
      await order.save();
    }

    res.status(200).json({
      msg: `Order status updated to ${normalizedStatus}`,
      order,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 6. confirm price ================
const confirmPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    if (req.user.id !== order.customerId?.toString() && req.user.role !== "admin") {
      return res.status(403).json({ msg: "Only the customer on this order can confirm the price" });
    }

    if (order.status !== "accepted") {
      return res.status(400).json({ msg: "Order is not in accepted state" });
    }

    if (confirmed) {
      order.status = "price_confirmed";
      // ========== NOTIFICATION: Price confirmed ==========
      const io = req.app.get('io');
      await createNotification(
        io,
        order.handymanId,
        'price_confirmed',
        ' Price Confirmed',
        `${req.user.name} confirmed the price`,
        { orderId: order._id, price: order.price }
      );
    } else {
      order.status = "cancelled";
      const rejectReason = req.body.cancellationReason || req.body.reason;
      order.cancellationReason = (typeof rejectReason === 'string' && rejectReason.trim().length > 0)
        ? rejectReason.trim()
        : 'رفض العميل السعر المقترح';
      order.cancelledBy = "customer";
      order.isHandymanOnTheWay = false;
      order.trackingStatus = "stopped";
      const io = req.app.get('io');
      await createNotification(
        io,
        order.handymanId,
        'order_cancelled',
        ' Price Rejected',
        `${req.user.name} rejected the price and cancelled the order`,
        { orderId: order._id }
      );
    }

    await order.save();
    res.json({ msg: confirmed ? "Price confirmed" : "Order cancelled", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== 7. get incoming pending orders for handyman ==========
const getPendingOrders = async (req, res) => {
  try {
    const { handymanId } = req.params;

    if (req.user.id !== handymanId && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You can only view your own pending orders" });
    }

    const orders = await Order.find({
      handymanId: new mongoose.Types.ObjectId(handymanId),
      status: "pending",
    })
      .populate("customerId", "name phone location")
      .sort({ createdAt: -1 });

    res.status(200).json({
      msg: "Pending orders",
      data: orders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========= 8. requestReschedule ===============
const requestReschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { newDate, newTime, reason, newDuration } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    const isCustomer = req.user.id === order.customerId?.toString();
    const isHandyman = req.user.id === order.handymanId?.toString();
    if (!isCustomer && !isHandyman && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You are not authorized to reschedule this order" });
    }

    const normalizedStatus = normalizeOrderStatus(order.status);
    if (!['scheduled', 'price_confirmed'].includes(order.status) && normalizedStatus !== 'scheduled') {
      return res.status(400).json({ msg: "لا يمكن إعادة جدولة هذا الطلب في حالته الحالية." });
    }

    // Prevent multiple pending reschedule requests at the same time
    if (order.rescheduleRequest && order.rescheduleRequest.status === "pending" && order.rescheduleRequest.newDate) {
      return res.status(400).json({ msg: "يوجد بالفعل طلب إعادة جدولة قيد المراجعة." });
    }

    if (!newDate) {
      return res.status(400).json({ msg: "تاريخ الموعد الجديد مطلوب" });
    }

    const targetDate = new Date(newDate);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ msg: "تاريخ الموعد غير صحيح" });
    }

    // Do not allow rescheduling to a date/time in the past
    if (targetDate.getTime() < Date.now() - 2 * 60 * 1000) {
      return res.status(400).json({ msg: "لا يمكن اختيار موعد في الماضي. يرجى اختيار موعد قادم." });
    }

    const duration = newDuration ? Number(newDuration) : order.expectedDuration;

    // Check Handyman schedule conflict
    const conflict = await checkScheduleConflict({
      handymanId: order.handymanId,
      scheduledDate: targetDate,
      expectedDuration: duration,
      excludeOrderId: order._id,
    });

    if (conflict.hasConflict) {
      return res.status(400).json({
        msg: "الموعد الجديد يتعارض مع موعد آخر للحرفي. يرجى اختيار موعد آخر.",
        conflict: conflict.conflictDetails,
      });
    }

    const requestedByRole = isCustomer ? "customer" : "handyman";
    const oldTimeStr = order.scheduledTime || (order.scheduledDate ? new Date(order.scheduledDate).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '');
    const newTimeStr = newTime || targetDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    order.rescheduleRequest = {
      requestedBy: requestedByRole,
      oldDate: order.scheduledDate,
      oldTime: oldTimeStr,
      newDate: targetDate,
      newTime: newTimeStr,
      reason: reason || "",
      newDuration: duration,
      status: "pending",
      createdAt: new Date(),
    };

    await order.save();

    // Populate customer and handyman names for notification if needed
    const populatedOrder = await Order.findById(id).populate('customerId', 'name').populate('handymanId', 'name');
    const senderName = req.user.name || (isCustomer ? populatedOrder.customerId?.name : populatedOrder.handymanId?.name) || 'مستخدم';
    const formattedNewDate = `${targetDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })} (${newTimeStr})`;

    // ========== NOTIFICATION: Reschedule request ==========
    const io = req.app.get('io');
    const recipientId = isCustomer ? order.handymanId : order.customerId;
    await createNotification(
      io,
      recipientId,
      'reschedule_request',
      'طلب إعادة جدولة جديد 🟡',
      `${senderName} طلب إعادة جدولة الطلب إلى ${formattedNewDate}`,
      {
        orderId: order._id,
        senderId: req.user.id,
        senderName,
        senderRole: requestedByRole,
        oldDate: order.scheduledDate,
        oldTime: oldTimeStr,
        newDate: targetDate,
        newTime: newTimeStr,
        formattedNewDate,
        reason: reason || '',
        createdAt: order.rescheduleRequest.createdAt,
      }
    );

    res.json({ msg: "تم إرسال طلب إعادة الجدولة بنجاح", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========= 9. respondReschedule ===============
const respondReschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { accepted, rejectionReason } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    const isOrderCustomer = req.user.id === order.customerId?.toString();
    const isOrderHandyman = req.user.id === order.handymanId?.toString();
    if (!isOrderCustomer && !isOrderHandyman && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You are not authorized to respond to this reschedule request" });
    }

    if (!order.rescheduleRequest || order.rescheduleRequest.status !== "pending") {
      return res.status(400).json({ msg: "لا يوجد طلب إعادة جدولة معلق لهذا الطلب." });
    }

    const normalizedStatus = normalizeOrderStatus(order.status);
    if (!['scheduled', 'price_confirmed'].includes(order.status) && normalizedStatus !== 'scheduled') {
      order.rescheduleRequest.status = "expired";
      order.rescheduleRequest.rejectedAt = new Date();
      await order.save();
      return res.status(400).json({ msg: "لا يمكن إعادة جدولة هذا الطلب في حالته الحالية." });
    }

    if (!order.rescheduleHistory) {
      order.rescheduleHistory = [];
    }

    const reqData = order.rescheduleRequest;
    const responderName = req.user.name || (isOrderCustomer ? 'العميل' : 'الحرفي');

    if (accepted) {
      // Validate target date is still in the future
      if (new Date(reqData.newDate).getTime() < Date.now() - 2 * 60 * 1000) {
        return res.status(400).json({ msg: "انتهت صلاحية الموعد المقترح لأنه أصبح في الماضي. يرجى إنشاء طلب جديد." });
      }

      const conflict = await checkScheduleConflict({
        handymanId: order.handymanId,
        scheduledDate: reqData.newDate,
        expectedDuration: reqData.newDuration || order.expectedDuration,
        excludeOrderId: order._id,
      });

      if (conflict.hasConflict) {
        return res.status(400).json({
          msg: "تعذر قبول الموعد لوجود تعارض في المواعيد مع طلب آخر لدى الحرفي.",
          conflict: conflict.conflictDetails,
        });
      }

      order.rescheduleHistory.push({
        requestedBy: reqData.requestedBy,
        oldDate: reqData.oldDate || order.scheduledDate,
        oldTime: reqData.oldTime || '',
        newDate: reqData.newDate,
        newTime: reqData.newTime || '',
        reason: reqData.reason || '',
        status: 'approved',
        createdAt: reqData.createdAt || new Date(),
        approvedAt: new Date(),
        approvedBy: req.user.id,
      });

      order.scheduledDate = reqData.newDate;
      if (reqData.newTime) {
        order.scheduledTime = reqData.newTime;
      }
      if (reqData.newDuration) {
        order.expectedDuration = reqData.newDuration;
      }
      order.rescheduleRequest.status = "approved";
      order.rescheduleRequest.approvedAt = new Date();
      order.rescheduleRequest.approvedBy = req.user.id;
    } else {
      order.rescheduleHistory.push({
        requestedBy: reqData.requestedBy,
        oldDate: reqData.oldDate || order.scheduledDate,
        oldTime: reqData.oldTime || '',
        newDate: reqData.newDate,
        newTime: reqData.newTime || '',
        reason: reqData.reason || '',
        status: 'rejected',
        createdAt: reqData.createdAt || new Date(),
        rejectedAt: new Date(),
        rejectedBy: req.user.id,
        rejectionReason: rejectionReason || req.body.reason || '',
      });

      order.rescheduleRequest.status = "rejected";
      order.rescheduleRequest.rejectedAt = new Date();
      order.rescheduleRequest.rejectedBy = req.user.id;
      order.rescheduleRequest.rejectionReason = rejectionReason || req.body.reason || '';
    }

    await order.save();

    // Mark previous reschedule_request notifications for this order as read for responder
    try {
      await Notification.updateMany(
        { userId: req.user.id, type: 'reschedule_request', 'data.orderId': order._id, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      );
    } catch (e) {
      console.log('Error updating notification read status:', e);
    }

    // ========== NOTIFICATION: Reschedule response to the requester ==========
    const io = req.app.get('io');
    const recipientId = reqData.requestedBy === "customer"
      ? order.customerId
      : order.handymanId;
    await createNotification(
      io,
      recipientId,
      'reschedule_response',
      accepted ? 'تمت الموافقة على إعادة الجدولة 🟢' : 'تم رفض طلب إعادة الجدولة 🔴',
      `${responderName} ${accepted ? 'وافق على' : 'رفض'} طلب إعادة الجدولة`,
      {
        orderId: order._id,
        accepted: !!accepted,
        responderId: req.user.id,
        responderName,
        rejectionReason: rejectionReason || req.body.reason || '',
        newDate: reqData.newDate,
        newTime: reqData.newTime,
      }
    );

    res.json({ msg: accepted ? "تمت الموافقة على الموعد الجديد وتحديث الطلب" : "تم رفض طلب إعادة الجدولة", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========= 10. startOrder (Dedicated Geo-Fenced Execution Endpoint) ===============
const startOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    const isHandyman = req.user.id === order.handymanId?.toString();
    const isAdmin = req.user.role === "admin";
    if (!isHandyman && !isAdmin) {
      return res.status(403).json({ msg: "Only handyman or admin can start work" });
    }

    if (!["price_confirmed", "arrived"].includes(order.status)) {
      return res.status(400).json({ msg: "Order must be price confirmed or arrived before starting work" });
    }

    // Active concurrency check
    const activeWorkOrders = await Order.find({
      handymanId: order.handymanId,
      _id: { $ne: order._id },
      status: { $in: ["in-progress", "arrived"] },
    });

    if (activeWorkOrders.length > 0) {
      return res.status(400).json({
        msg: "لديك طلب آخر قيد التنفيذ حالياً. يرجى إكماله أولاً.",
        activeOrderId: activeWorkOrders[0]._id,
      });
    }

    // Server-Side Geo-Fencing Verification
    const hLat = Number(req.body.latitude ?? req.body.handymanLocation?.latitude ?? req.body.coordinates?.[1] ?? req.body.handymanLocation?.coordinates?.[1]);
    const hLng = Number(req.body.longitude ?? req.body.handymanLocation?.longitude ?? req.body.coordinates?.[0] ?? req.body.handymanLocation?.coordinates?.[0]);

    if (!Number.isFinite(hLat) || !Number.isFinite(hLng) || hLat < -90 || hLat > 90 || hLng < -180 || hLng > 180) {
      return res.status(400).json({
        msg: "إحداثيات موقع الحرفي الحالي مطلوبة للتحقق من التواجد في موقع العميل قبل بدء التنفيذ.",
      });
    }

    const serviceCoords = (order.orderLocation?.coordinates && order.orderLocation.coordinates.length === 2 && (order.orderLocation.coordinates[0] !== 0 || order.orderLocation.coordinates[1] !== 0))
      ? order.orderLocation.coordinates
      : order.customerLocation?.coordinates;

    if (!serviceCoords || serviceCoords.length !== 2) {
      return res.status(400).json({ msg: "موقع الخدمة غير محدد في الطلب." });
    }

    const [cLng, cLat] = serviceCoords;
    const R = 6371000;
    const dLat = ((cLat - hLat) * Math.PI) / 180;
    const dLon = ((cLng - hLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((hLat * Math.PI) / 180) *
        Math.cos((cLat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const serverCalculatedDistance = Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));

    const allowedRadius = Number(process.env.GEO_FENCE_RADIUS_METERS) || 50;

    if (serverCalculatedDistance > allowedRadius) {
      return res.status(400).json({
        msg: `لا يمكنك بدء التنفيذ الآن. يجب أن تصل إلى موقع العميل أولاً. المسافة الحالية: ${serverCalculatedDistance} متر (الحد المسموح: ${allowedRadius} متر).`,
        distance: serverCalculatedDistance,
        allowedRadius,
        isNearCustomer: false,
      });
    }

    order.status = "in-progress";
    order.executionStartedAt = new Date();
    order.executionStartLatitude = hLat;
    order.executionStartLongitude = hLng;
    order.executionStartDistance = serverCalculatedDistance;
    order.startedBy = req.user.id;

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('orderStatusChanged', {
        orderId: id,
        status: 'in-progress',
        executionStartedAt: order.executionStartedAt,
      });
    }

    res.json({ msg: "تم بدء تنفيذ الطلب بنجاح", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Confirm Cash Payment ==========
const confirmCashPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ msg: "Order not found" });
    }

    const isHandyman = req.user.id === order.handymanId?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isHandyman && !isAdmin) {
      return res.status(403).json({ msg: "Only the handyman can confirm receiving the payment" });
    }

    if (order.status !== "completed") {
      return res.status(400).json({ msg: "Order must be completed before confirming payment" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ msg: "Payment already confirmed" });
    }

    if (order.paymentMethod !== 'cash') {
      return res.status(400).json({ msg: 'Cash confirmation is only available for cash payments' });
    }

    order.paymentStatus = "paid";
    order.paidAt = new Date();
    await order.save();

    if (order.penaltyAmount > 0) {
      await User.findOneAndUpdate(
        { _id: order.customerId, penaltyAmount: { $gt: 0 } },
        { $set: { penaltyAmount: 0 } }
      );
    }

    const WALLET_SUSPENSION_THRESHOLD = 500; // EGP
    const handyman = await Handyman.findOne({ userId: order.handymanId });
    let justSuspended = false;
    if (handyman) {
      handyman.walletBalance = (handyman.walletBalance || 0) + (order.commissionAmount || 0);
      if (handyman.walletBalance >= WALLET_SUSPENSION_THRESHOLD && !handyman.isSuspended) {
        handyman.isSuspended = true;
        handyman.suspendedReason = WALLET_DEBT_SUSPENSION_REASON;
        justSuspended = true;
      }
      await handyman.save();
    }

    const io = req.app.get('io');
    await createNotification(
      io,
      order.customerId,
      'payment_confirmed',
      ' Payment Confirmed',
      `${req.user.name} confirmed receiving the payment for your order`,
      { orderId: order._id }
    );

    if (justSuspended) {
      await createNotification(
        io,
        order.handymanId,
        'account_blocked',
        ' Account Suspended',
        `تم إيقاف حسابك مؤقتاً لتجاوز رصيد العمولة المستحقة ${WALLET_SUSPENSION_THRESHOLD} ج.م. يرجى التواصل مع الدعم للتسوية.`,
        { walletBalance: handyman.walletBalance }
      );
    }

    res.status(200).json({ msg: "Payment confirmed", order, walletBalance: handyman?.walletBalance });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

/**
 * Helper: Calculate scheduled appointment timestamp in ms
 * Combines scheduledDate with scheduledTime (e.g. "16:40")
 */
const getScheduledAppointmentTime = (scheduledDate, scheduledTimeStr) => {
  if (!scheduledDate) return null;
  const d = new Date(scheduledDate);
  if (isNaN(d.getTime())) return null;

  if (scheduledTimeStr && typeof scheduledTimeStr === 'string' && scheduledTimeStr.includes(':')) {
    const parts = scheduledTimeStr.trim().split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      d.setHours(hours, minutes, 0, 0);
      return d.getTime();
    }
  }
  return d.getTime();
};

/**
 * Helper: Compute realistic departure window for a scheduled order.
 * - originCoords: [lng, lat] of handyman's current location (or Handyman profile)
 * - destinationCoords: [lng, lat] of order location snapshot
 * - safetyMarginMinutes: default 10 minutes buffer
 */
const computeDepartureWindow = async ({ order, handymanCoords = null, safetyMarginMinutes = 10 }) => {
  const isScheduled = order.requestType === 'scheduled' || !!order.scheduledDate;
  const appointmentMs = getScheduledAppointmentTime(order.scheduledDate, order.scheduledTime);

  if (!appointmentMs) {
    return {
      canDepart: true,
      isScheduled: false,
      reason: 'No scheduled appointment time',
      travelTimeMinutes: 15,
      safetyMarginMinutes: 0,
      departureTimeMs: Date.now(),
      appointmentTimeMs: Date.now(),
      timeUntilDepartureMinutes: 0,
    };
  }

  const nowMs = Date.now();
  const serviceCoords = (order.orderLocation?.coordinates && order.orderLocation.coordinates.length === 2 && (order.orderLocation.coordinates[0] !== 0 || order.orderLocation.coordinates[1] !== 0))
    ? order.orderLocation.coordinates
    : order.customerLocation?.coordinates;

  let hCoords = handymanCoords;
  if (!hCoords || hCoords.length !== 2 || (hCoords[0] === 0 && hCoords[1] === 0)) {
    if (order.handymanLiveLocation?.coordinates?.length === 2 && (order.handymanLiveLocation.coordinates[0] !== 0 || order.handymanLiveLocation.coordinates[1] !== 0)) {
      hCoords = order.handymanLiveLocation.coordinates;
    } else {
      const hDoc = await Handyman.findOne({ userId: order.handymanId });
      if (hDoc?.location?.coordinates?.length === 2) {
        hCoords = hDoc.location.coordinates;
      }
    }
  }

  let travelTimeMinutes = 15; // default fallback (15 min)
  let calculatedDistKm = 5;

  if (hCoords && hCoords.length === 2 && serviceCoords && serviceCoords.length === 2) {
    const [hLng, hLat] = hCoords;
    const [cLng, cLat] = serviceCoords;
    if (hLat !== 0 && hLng !== 0 && cLat !== 0 && cLng !== 0) {
      const R = 6371000;
      const dLat = ((cLat - hLat) * Math.PI) / 180;
      const dLon = ((cLng - hLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((hLat * Math.PI) / 180) *
          Math.cos((cLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const distM = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      calculatedDistKm = distM / 1000;
      travelTimeMinutes = Math.max(5, Math.round((calculatedDistKm / 30) * 60)); // 30 km/h avg

      try {
        const routeData = await calculateRoute({ lat: hLat, lng: hLng }, { lat: cLat, lng: cLng });
        if (routeData && Number.isFinite(routeData.eta) && routeData.eta > 0) {
          travelTimeMinutes = Math.round(routeData.eta);
        }
      } catch (e) {
        console.warn('[DEPARTURE WINDOW] TomTom route calculation fallback:', e.message);
      }
    }
  }

  const totalLeadMinutes = travelTimeMinutes + safetyMarginMinutes;
  const departureTimeMs = appointmentMs - (totalLeadMinutes * 60 * 1000);
  const canDepart = nowMs >= departureTimeMs;
  const timeUntilDepartureMinutes = Math.max(0, Math.round((departureTimeMs - nowMs) / (60 * 1000)));

  return {
    canDepart,
    isScheduled: true,
    appointmentTime: new Date(appointmentMs).toISOString(),
    appointmentTimeMs: appointmentMs,
    departureTime: new Date(departureTimeMs).toISOString(),
    departureTimeMs,
    travelTimeMinutes,
    safetyMarginMinutes,
    totalLeadMinutes,
    timeUntilDepartureMinutes,
    distanceKm: Number(calculatedDistKm.toFixed(1)),
  };
};

// ========== Query Departure Window (for UI and Pre-check) ==========
const getDepartureWindow = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    const hLat = Number(req.query.latitude ?? req.body?.latitude);
    const hLng = Number(req.query.longitude ?? req.body?.longitude);
    const handymanCoords = (Number.isFinite(hLat) && Number.isFinite(hLng)) ? [hLng, hLat] : null;

    const windowInfo = await computeDepartureWindow({ order, handymanCoords });
    res.status(200).json({ data: windowInfo });
  } catch (error) {
    console.error('Error in getDepartureWindow:', error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Handyman marks "on the way" ==========
const markOnTheWay = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ msg: "Order not found" });
    }

    const isHandyman = req.user.id === order.handymanId?.toString();
    const isAdmin = req.user.role === "admin";

    if (!isHandyman && !isAdmin) {
      return res.status(403).json({ msg: "Only the assigned handyman can do this" });
    }

    if (!["price_confirmed", "scheduled", "in-progress"].includes(order.status)) {
      return res.status(400).json({ msg: "Order must be price confirmed before starting the trip" });
    }

    // Departure Window Validation for Scheduled Orders
    const reqLat = Number(req.body.latitude ?? req.body.handymanLocation?.latitude ?? req.body.coordinates?.[1]);
    const reqLng = Number(req.body.longitude ?? req.body.handymanLocation?.longitude ?? req.body.coordinates?.[0]);
    const handymanCoordsParam = (Number.isFinite(reqLat) && Number.isFinite(reqLng)) ? [reqLng, reqLat] : null;

    const departureWindow = await computeDepartureWindow({
      order,
      handymanCoords: handymanCoordsParam,
      safetyMarginMinutes: 10,
    });

    if (!departureWindow.canDepart && !isAdmin) {
      const remainingMin = departureWindow.timeUntilDepartureMinutes;
      const hours = Math.floor(remainingMin / 60);
      const mins = remainingMin % 60;
      const timeStr = hours > 0 ? `${hours} ساعة و ${mins} دقيقة` : `${mins} دقيقة`;
      return res.status(400).json({
        msg: `لا يمكن بدء التوجه الآن. موعد الطلب محدد في (${departureWindow.appointmentTime}). تبدأ نافذة التحرك قبل الموعد بـ (${departureWindow.totalLeadMinutes} دقيقة) لتغطية وقت الطريق (${departureWindow.travelTimeMinutes} دقيقة) وهامش الأمان. المتبقي لبدء التحرك: ${timeStr}.`,
        departureWindow,
      });
    }

    if (order.trackingStatus !== "active") {
      const handymanOrders = await Order.find({
        handymanId: order.handymanId,
        _id: { $ne: order._id },
        isHandymanOnTheWay: true,
        status: { $in: ["price_confirmed", "in-progress"] },
      });

      const activeOtherOrder = handymanOrders.find((o) => {
        if (o.trackingStatus === "expired") return false;
        if (o.trackingExpiresAt && new Date(o.trackingExpiresAt).getTime() <= Date.now()) return false;
        return true;
      });

      if (activeOtherOrder) {
        console.warn(`[TRACKING REJECTED] Handyman ${order.handymanId} already has active tracking order ${activeOtherOrder._id}`);
        return res.status(400).json({
          msg: "لديك طلب آخر قيد التتبع حالياً. يجب وصول الطلب الحالي قبل تتبع طلب جديد.",
          activeOrderId: activeOtherOrder._id,
        });
      }
    }

    if (order.trackingStatus === "active" && order.trackingExpiresAt) {
      console.log(`[TRACKING] Order ${id} already active — preserving existing tracking window expiring at ${order.trackingExpiresAt.toISOString()}`);
    } else {
      order.isHandymanOnTheWay = true;
      order.onTheWayAt = new Date();
      order.trackingStatus = "active";
      order.trackingStartedAt = new Date();

      let handymanCoords =
        order.handymanLiveLocation?.coordinates?.length === 2
          ? order.handymanLiveLocation.coordinates
          : null;

      if (!handymanCoords || (handymanCoords[0] === 0 && handymanCoords[1] === 0)) {
        const hDoc = await Handyman.findOne({ userId: order.handymanId });
        if (hDoc?.location?.coordinates?.length === 2) {
          handymanCoords = hDoc.location.coordinates;
        }
      }

      const customerCoords = order.customerLocation?.coordinates?.length === 2
        ? order.customerLocation.coordinates
        : null;

      let initialEta = null;
      let calculatedDistKm = null;

      if (handymanCoords && customerCoords) {
        const [hLng, hLat] = handymanCoords;
        const [cLng, cLat] = customerCoords;

        if (hLat !== 0 && hLng !== 0 && cLat !== 0 && cLng !== 0) {
          const R = 6371000;
          const dLat = ((cLat - hLat) * Math.PI) / 180;
          const dLon = ((cLng - hLng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((hLat * Math.PI) / 180) *
              Math.cos((cLat * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          const distM = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          calculatedDistKm = distM / 1000;
          // Actual distance based travel time (~30 km/h urban transit)
          initialEta = Math.max(5, Math.round((calculatedDistKm / 30) * 60));

          try {
            const routeData = await calculateRoute({ lat: hLat, lng: hLng }, { lat: cLat, lng: cLng });
            if (routeData && Number.isFinite(routeData.eta) && routeData.eta > 0) {
              initialEta = Math.round(routeData.eta);
            }
          } catch (err) {
            console.warn('[TRACKING] Initial route calculation failed for markOnTheWay:', err.message);
          }
        }
      }

      if (!Number.isFinite(initialEta) || initialEta <= 0) {
        initialEta = 15;
      }

      order.eta = initialEta;
      if (calculatedDistKm != null) order.distance = Number(calculatedDistKm.toFixed(1));
      order.arrivalTime = new Date(order.trackingStartedAt.getTime() + initialEta * 60 * 1000).toISOString();

      const gracePeriodMinutes = parseInt(process.env.TRACKING_GRACE_PERIOD_MINUTES || '15', 10);
      const totalWindowMinutes = initialEta + (Number.isFinite(gracePeriodMinutes) ? gracePeriodMinutes : 15);
      order.trackingExpiresAt = new Date(order.trackingStartedAt.getTime() + totalWindowMinutes * 60 * 1000);

      order.tripStartedAt = new Date();
      if (handymanCoords && handymanCoords.length === 2) {
        order.tripStartLongitude = handymanCoords[0];
        order.tripStartLatitude = handymanCoords[1];
        order.liveTracking = {
          isActive: true,
          latitude: handymanCoords[1],
          longitude: handymanCoords[0],
          heading: Number(req.body.heading) || 0,
          speed: Number(req.body.speed) || 0,
          accuracy: Number(req.body.accuracy) || 0,
          updatedAt: new Date(),
          timestamp: new Date(),
        };
      } else {
        order.liveTracking = {
          isActive: true,
          updatedAt: new Date(),
          timestamp: new Date(),
        };
      }
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('trackingStarted', {
        orderId: id,
        handymanName: req.user.name,
        message: 'Handyman is on the way!',
        trackingStatus: order.trackingStatus,
        trackingStartedAt: order.trackingStartedAt,
        trackingExpiresAt: order.trackingExpiresAt,
      });
    }
    await createNotification(
      io,
      order.customerId,
      'handyman_on_the_way',
      ' Handyman On The Way',
      `${req.user.name} is on the way to you`,
      { orderId: order._id }
    );

    res.status(200).json({ msg: "Marked as on the way", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Update Handyman Live Location via REST API ==========
const updateLiveLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, lat, lng, heading, speed, accuracy, timestamp } = req.body;

    const numLat = Number(latitude ?? lat);
    const numLng = Number(longitude ?? lng);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180 || (numLat === 0 && numLng === 0)) {
      return res.status(400).json({ msg: "Invalid or malformed GPS coordinates" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ msg: "Order not found" });
    }

    const isHandyman = req.user.id === order.handymanId?.toString();
    const isAdmin = req.user.role === "admin";
    if (!isHandyman && !isAdmin) {
      return res.status(403).json({ msg: "Only the assigned handyman can update live location" });
    }

    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ msg: "Live tracking is closed for completed or cancelled orders" });
    }

    if (!order.isHandymanOnTheWay && !['on_the_way', 'price_confirmed', 'in-progress'].includes(order.status)) {
      return res.status(400).json({ msg: "Order is not active for live location updates" });
    }

    const incomingTime = timestamp ? new Date(timestamp).getTime() : Date.now();
    const lastUpdateMs = order.liveTracking?.timestamp ? new Date(order.liveTracking.timestamp).getTime() : 0;

    // Discard stale timestamp replay
    if (incomingTime < lastUpdateMs) {
      return res.status(200).json({ msg: "Stale location update ignored", order });
    }

    order.handymanLiveLocation = {
      type: "Point",
      coordinates: [numLng, numLat],
      updatedAt: new Date(),
    };

    order.liveTracking = {
      isActive: true,
      latitude: numLat,
      longitude: numLng,
      heading: Number(heading) || 0,
      speed: Number(speed) || 0,
      accuracy: Number(accuracy) || 0,
      updatedAt: new Date(),
      timestamp: new Date(incomingTime),
    };

    await order.save();

    // Broadcast update via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('locationUpdate', {
        orderId: id,
        lat: numLat,
        lng: numLng,
        latitude: numLat,
        longitude: numLng,
        heading: order.liveTracking.heading,
        speed: order.liveTracking.speed,
        accuracy: order.liveTracking.accuracy,
        timestamp: order.liveTracking.timestamp,
        updatedAt: order.liveTracking.updatedAt,
      });
    }

    res.status(200).json({
      msg: "Live location updated",
      liveTracking: order.liveTracking,
    });
  } catch (error) {
    console.error('Error in updateLiveLocation:', error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Create Stripe Payment Intent ==========
const createStripePaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) return res.status(404).json({ msg: "Order not found" });

    if (req.user.id !== order.customerId?.toString() && req.user.role !== "admin") {
      return res.status(403).json({ msg: "Only the customer on this order can initiate payment" });
    }

    if (order.status !== "completed") {
      return res.status(400).json({ msg: "Payment can only be initiated after the order is completed" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ msg: "This order has already been paid" });
    }

    const amountInCents = Math.round((order.totalPrice || order.price || 0) * 100);
    if (amountInCents <= 0) {
      return res.status(400).json({ msg: "Order has no valid price to charge" });
    }

    if (order.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(existing.status)) {
        return res.json({ clientSecret: existing.client_secret });
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: "egp",
        metadata: {
          orderId: id,
          customerId: req.user.id,
          handymanId: order.handymanId?.toString(),
        },
      },
      { idempotencyKey: `order_${id}_${amountInCents}` }
    );

    order.stripePaymentIntentId = paymentIntent.id;
    order.paymentMethod = "card";
    order.paymentStatus = "pending";
    await order.save();

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========== Customer selects payment method (cash or card) after completion ==========
const selectPaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;

    if (!['cash', 'card'].includes(paymentMethod)) {
      return res.status(400).json({ msg: 'paymentMethod must be either "cash" or "card"' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    if (req.user.id !== order.customerId?.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Only the customer on this order can select a payment method' });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({ msg: 'Payment method can only be selected after the order is completed' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ msg: 'This order has already been paid — payment method cannot be changed' });
    }

    if (order.paymentMethod === 'card' && order.stripePaymentIntentId && paymentMethod !== 'card') {
      try {
        const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
          return res.status(400).json({
            msg: 'A card payment is already in progress. Complete or cancel it before switching to cash.',
          });
        }
      } catch (_) {}
    }

    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'pending';
    await order.save();

    const io = req.app.get('io');
    await createNotification(
      io,
      order.handymanId,
      'payment_method_selected',
      'Payment Method Selected',
      paymentMethod === 'cash'
        ? 'The customer chose to pay in cash. Please confirm receipt when paid.'
        : 'The customer chose to pay by card.',
      { orderId: order._id, paymentMethod }
    );

    res.status(200).json({ msg: 'Payment method selected', order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrder,
  getCustomerOrders,
  getHandymanOrders,
  updateOrderStatus,
  getPendingOrders,
  confirmPrice,
  respondReschedule,
  requestReschedule,
  markOnTheWay,
  confirmCashPayment,
  createStripePaymentIntent,
  selectPaymentMethod,
  startOrder,
  updateLiveLocation,
  checkScheduleConflict,
  getDepartureWindow,
  computeDepartureWindow,
  getScheduledAppointmentTime,
};
