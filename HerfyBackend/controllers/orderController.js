const { json } = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const axios = require("axios");
const mongoose = require("mongoose");
const stripe = require("../config/stripe");
const { createNotification } = require("./notificationController");
const { cleanupThrottle } = require("../socket/liveTrackingThrottle");
const { WALLET_DEBT_SUSPENSION_REASON } = require("../utils/constants");
const { calculateRoute } = require("../utils/tomtom");

const MAX_IN_PROGRESS_ORDERS = 2;


// ========== 1. create order ==========
const createOrder = async (req, res) => {
  try {
    const {
      handymanId,
      profession,
      description,
      images,
      requestType,
      scheduledDate,
      estimatedPrice,
      customerLocation,
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

    let finalPrice = estimatedPrice || 0;
    // New orders never carry the customer's outstanding penalty —
    // the customer is blocked from creating orders until penaltyAmount = 0.
    let serviceAmount = finalPrice;
    let penaltyAmount = 0;
    let totalPrice = serviceAmount + penaltyAmount;

    const commissionRate = isEmergencyBool ? 15 : 10;

    const order = await Order.create({
      customerId: req.user.id,
      handymanId,
      profession,
      description,
      images,
      requestType,
      scheduledDate,
      estimatedPrice: finalPrice,
      serviceAmount,
      penaltyAmount,
      totalPrice,
      customerLocation: {
        type: "Point",
        coordinates: customerLocation.coordinates,
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
    const { page = 1, limit = 10 } = req.query;


    if (req.user.id !== customerId && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You can only view your own orders" });
    }

    const skip = (page - 1) * limit;

    const orders = await Order.find({ customerId })
      .populate("handymanId", "name profession")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ customerId });

    res.status(200).json({
      msg: "Your Orders",
      data: orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
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

    const validStatuses = ["pending", "accepted", "price_confirmed", "in-progress", "arrived", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
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
    let orderAlreadySaved = false;

    if (currentStatus === "completed") {
      return res.status(400).json({ msg: "Cannot update a completed order" });
    }

    // ========== Arrived Logic ==========
    if (status === "arrived") {
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can mark order as arrived" });
      }
      if (!["in-progress", "price_confirmed"].includes(currentStatus)) {
        return res.status(400).json({ msg: "Order must be in-progress before marking as arrived" });
      }
      order.trackingStatus = "stopped";
      order.isHandymanOnTheWay = false;
      console.log(`[TRACKING] Stopped (handyman arrived) for order ${id}`);

      const io = req.app.get('io');
      if (io) {
        io.to(id).emit('handymanArrived', {
          orderId: id,
          msg: 'الحرفي وصل إلى موقع العميل',
          distanceRemaining: 0,
          eta: 0,
        });
      }
      cleanupThrottle(id);
    }

    // ========== Cancelled Logic ==========
    if (status === "cancelled") {
      if (currentStatus === "pending" && !isCustomer && !isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only customer or handyman can cancel pending order" });
      }

      if (currentStatus === "accepted" && isCustomer) {
        // No penalty - customer hasn't confirmed price yet
      }

      if (currentStatus === "accepted" && isHandyman) {
        // No penalty - customer hasn't confirmed price yet
      }

      if (
        (currentStatus === "price_confirmed" || currentStatus === "in-progress" || currentStatus === "arrived") && isHandyman) {
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

          handyman.monthlyCancellationCount++;

          if (handyman.monthlyCancellationCount >= 3) {
            handyman.penaltyAmount += 50;

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
              }
            );
          }

          handyman.rating = Math.max(0, handyman.rating - 0.5);

          await handyman.save();
        }
      }

      if ((currentStatus === "price_confirmed" || currentStatus === "in-progress" || currentStatus === "arrived") && isCustomer) {
        const isTrackingExpired =
          order.trackingStatus === "expired" ||
          (order.trackingExpiresAt && Date.now() >= new Date(order.trackingExpiresAt).getTime());

        if (isTrackingExpired) {
          console.log('[ORDER] Tracking expired - penalty waived');
          order.penaltyAmount = 0;
        } else {
          // Progressive penalty: 50 + (penaltyCount * 10)
          // No accumulation: penaltyAmount is ASSIGNED the current penalty, not added.
          // Read current penaltyCount to calculate the penalty, then apply atomically.
          const customer = await User.findById(order.customerId);
          if (customer) {
            const currentPenaltyCount = customer.penaltyCount || 0;
            const penaltyForCancellation = 50 + (currentPenaltyCount * 10);
            // Atomic: $inc penaltyCount + $set penaltyAmount in one operation.
            const updatedCustomer = await User.findByIdAndUpdate(
              order.customerId,
              {
                $inc: { penaltyCount: 1 },
                $set: { penaltyAmount: penaltyForCancellation },
              },
              { new: true }
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

      if (currentStatus === "completed") {
        return res.status(400).json({ msg: "Cannot cancel a completed order" });
      }
      order.trackingStatus = "stopped";
      order.isHandymanOnTheWay = false;
      cleanupThrottle(id);
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

      // FIX (H1): previously any currentStatus could be moved to "accepted",
      // letting a cancelled or disputed order be silently reopened (and
      // bypassing admin dispute resolution). Only a pending order can be accepted.
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
      }

      // FIX (M3): the count-check-then-write below used to be a classic
      // TOCTOU race — two concurrent "accept" requests for the same
      // handyman could both read below the cap before either write completed,
      // letting the in-progress order cap be exceeded. Wrap the recheck + reservation
      // in a transaction so only one of them can win the last slot.
      // (Falls back to the old non-transactional check if the deployment's
      // MongoDB doesn't support transactions — e.g. a standalone dev
      // instance — so this can't break local/dev setups.)
      if (price !== undefined) {
        order.price = price;
        order.serviceAmount = price;
        order.totalPrice = price + (order.penaltyAmount || 0);
      }
      order.status = "accepted";

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const raceCount = await Order.countDocuments({
            handymanId: order.handymanId,
            status: "in-progress",
          }).session(session);

          if (raceCount >= MAX_IN_PROGRESS_ORDERS) {
            const capError = new Error("IN_PROGRESS_CAP_REACHED");
            capError.isCapError = true;
            throw capError;
          }

          await order.save({ session });
        });
        orderAlreadySaved = true;
      } catch (txErr) {
        if (txErr.isCapError) {
          return res.status(400).json({
            msg: "You have reached the maximum number of in-progress orders (2). Please complete one first.",
          });
        }
        // Transactions unsupported in this environment (e.g. standalone
        // Mongo without a replica set) — fall back to the previous
        // non-transactional check rather than failing the request outright.
        console.log("Accept transaction unavailable, falling back:", txErr.message);
        const inProgressOrders = await Order.countDocuments({
          handymanId: order.handymanId,
          status: "in-progress",
        });
        if (inProgressOrders >= MAX_IN_PROGRESS_ORDERS) {
          return res.status(400).json({
            msg: "You have reached the maximum number of in-progress orders (2). Please complete one first.",
          });
        }
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

      if (isHandyman && typeof handymanProfile !== 'undefined' && handymanProfile) {
        handymanProfile.acceptedOffers += 1;
        if (handymanProfile.totalOffers > 0) {
          handymanProfile.acceptanceRate = handymanProfile.acceptedOffers / handymanProfile.totalOffers;
        }
        await handymanProfile.save();
      }
    }

    // ========== In-Progress Logic ==========
    if (status === "in-progress") {
      // Allow transition from price_confirmed (normal on-the-way flow) OR
      // from arrived (handyman physically reached destination and is starting work)
      if (!["price_confirmed", "arrived"].includes(currentStatus)) {
        return res.status(400).json({ msg: "Order must be price confirmed or arrived before starting work" });
      }
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can start work" });
      }

      const inProgressCount = await Order.countDocuments({
        handymanId: order.handymanId,
        status: "in-progress",
      });

      if (inProgressCount >= MAX_IN_PROGRESS_ORDERS) {
        return res.status(400).json({
          msg: "You have reached the maximum number of in-progress orders (2). Please complete one first.",
        });
      }

      // This transition will occupy the final available slot, so hide the
      // handyman from new offers immediately after it succeeds.
      if (inProgressCount + 1 >= MAX_IN_PROGRESS_ORDERS) {
        await Handyman.findOneAndUpdate(
          { userId: order.handymanId },
          { isAvailable: false }
        );
      }
    }

    // ========== Completed Logic ==========
    if (status === "completed") {
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can complete order" });
      }

      if (!["in-progress", "arrived"].includes(currentStatus)) {
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

      const inProgressCount = await Order.countDocuments({
        handymanId: order.handymanId,
        status: "in-progress",
      });

      const updateQuery = { $inc: { completedOrders: 1 } };
      if (inProgressCount <= MAX_IN_PROGRESS_ORDERS) {
        updateQuery.isAvailable = true;
      }
      await Handyman.findOneAndUpdate(
        { userId: order.handymanId },
        updateQuery
      );
      order.trackingStatus = "stopped";
      order.isHandymanOnTheWay = false;
      cleanupThrottle(id);
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
      order.status = status;
      if (['arrived', 'completed', 'cancelled', 'disputed'].includes(status)) {
        order.isHandymanOnTheWay = false;
        if (order.trackingStatus !== 'expired') {
          order.trackingStatus = 'stopped';
        }
      }
      await order.save();
    }

    res.status(200).json({
      msg: `Order status updated to ${status}`,
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

    // SECURITY FIX (C3): only the order's own customer (or an admin) may
    // confirm/reject its price — previously any authenticated user could.
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
    const { newDate } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    // SECURITY FIX (C5): only the order's customer/handyman (or an admin)
    // may request a reschedule on it.
    const isOrderCustomer = req.user.id === order.customerId?.toString();
    const isOrderHandyman = req.user.id === order.handymanId?.toString();
    if (!isOrderCustomer && !isOrderHandyman && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You are not authorized to reschedule this order" });
    }

    order.rescheduleRequest = {
      requestedBy: req.user.role === "customer" ? "customer" : "handyman",
      newDate,
      status: "pending",
      createdAt: new Date(),
    };

    await order.save();
    // ========== NOTIFICATION: Reschedule request ==========
    const io = req.app.get('io');
    const recipientId = req.user.role === "customer" ? order.handymanId : order.customerId;
    await createNotification(
      io,
      recipientId,
      'reschedule_request',
      ' Reschedule Request',
      `${req.user.name} requested to reschedule`,
      { orderId: order._id, newDate }
    );

    res.json({ msg: "Reschedule request sent", order });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// ========= 9. respondReschedule ===============
const respondReschedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { accepted } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ msg: "Order not found" });

    // SECURITY FIX (C5): only the order's customer/handyman (or an admin)
    // may respond to its reschedule request.
    const isOrderCustomer = req.user.id === order.customerId?.toString();
    const isOrderHandyman = req.user.id === order.handymanId?.toString();
    if (!isOrderCustomer && !isOrderHandyman && req.user.role !== "admin") {
      return res.status(403).json({ msg: "You are not authorized to respond to this reschedule request" });
    }

    // BUG FIX: guard against a missing rescheduleRequest (previously threw,
    // caught by the generic catch, and returned a confusing 500).
    if (!order.rescheduleRequest || order.rescheduleRequest.status !== "pending") {
      return res.status(400).json({ msg: "No pending reschedule request" });
    }

    if (accepted) {
      order.scheduledDate = order.rescheduleRequest.newDate;
      order.rescheduleRequest.status = "accepted";
    } else {
      order.rescheduleRequest.status = "rejected";
    }

    await order.save();
    // ========== NOTIFICATION: Reschedule response ==========
    const io = req.app.get('io');
    const recipientId = order.rescheduleRequest.requestedBy === "customer"
      ? order.customerId
      : order.handymanId;
    await createNotification(
      io,
      recipientId,
      'reschedule_response',
      accepted ? ' Reschedule Accepted' : ' Reschedule Rejected',
      `${req.user.name} ${accepted ? 'accepted' : 'rejected'} the reschedule request`,
      { orderId: order._id }
    );

    res.json({ msg: accepted ? "Reschedule accepted" : "Reschedule rejected", order });
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

    // Settle legacy penalty: only if the order actually carried a penalty
    // (new orders always have penaltyAmount = 0 since the customer is blocked).
    // Sets customer.penaltyAmount to 0 (not subtraction) — there is only one
    // outstanding penalty at a time (no accumulation). Atomic + idempotent:
    // the $gt: 0 condition means a duplicate request does nothing.
    if (order.penaltyAmount > 0) {
      await User.findOneAndUpdate(
        { _id: order.customerId, penaltyAmount: { $gt: 0 } },
        { $set: { penaltyAmount: 0 } }
      );
    }

    // The customer paid the handyman in cash directly, so the platform's
    // commission on this order hasn't actually been collected — track it as
    // a debt on the handyman's wallet.
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

// ========== Handyman marks "on the way" ==========
// Separate from status transitions on purpose: it doesn't change the order
// status, it only flips the flag that unlocks the live map for the customer.
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

    if (!["price_confirmed", "in-progress"].includes(order.status)) {
      return res.status(400).json({ msg: "Order must be price confirmed before starting the trip" });
    }

    // BUSINESS RULE: A handyman may have ONLY ONE active live-tracking order at any given time.
    // If tracking is not already active for THIS order, verify the handyman has no OTHER active tracking order.
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

    // CRITICAL RULE 1: markOnTheWay is sole authoritative backend initialization of a tracking session.
    // If tracking is ALREADY active, preserve existing trackingStartedAt and trackingExpiresAt.
    if (order.trackingStatus === "active" && order.trackingExpiresAt) {
      console.log(`[TRACKING] Order ${id} already active — preserving existing tracking window expiring at ${order.trackingExpiresAt.toISOString()}`);
    } else {
      order.isHandymanOnTheWay = true;
      order.onTheWayAt = new Date();
      order.trackingStatus = "active";
      order.trackingStartedAt = new Date();

      // Resolve initial ETA
      let initialEta = null;
      if (Number.isFinite(order.eta) && order.eta > 0) {
        initialEta = order.eta;
      } else if (
        order.handymanLiveLocation?.coordinates?.length === 2 &&
        order.customerLocation?.coordinates?.length === 2
      ) {
        const [hLng, hLat] = order.handymanLiveLocation.coordinates;
        const [cLng, cLat] = order.customerLocation.coordinates;
        if (hLat !== 0 && hLng !== 0 && cLat !== 0 && cLng !== 0) {
          try {
            const routeData = await calculateRoute({ lat: hLat, lng: hLng }, { lat: cLat, lng: cLng });
            if (routeData && Number.isFinite(routeData.eta) && routeData.eta > 0) {
              initialEta = routeData.eta;
            }
          } catch (err) {
            console.warn('[TRACKING] Initial route calculation failed for markOnTheWay:', err.message);
          }
        }
      }

      if (!Number.isFinite(initialEta) || initialEta <= 0) {
        const defaultEta = parseInt(process.env.TRACKING_DEFAULT_ETA_MINUTES || '25', 10);
        initialEta = Number.isFinite(defaultEta) && defaultEta > 0 ? defaultEta : 25;
        console.log(`[TRACKING] Initial ETA fallback used: ${initialEta} min`);
      }

      const gracePeriodMinutes = parseInt(process.env.TRACKING_GRACE_PERIOD_MINUTES || '15', 10);
      const totalWindowMinutes = initialEta + (Number.isFinite(gracePeriodMinutes) ? gracePeriodMinutes : 15);
      order.trackingExpiresAt = new Date(order.trackingStartedAt.getTime() + totalWindowMinutes * 60 * 1000);
      console.log(`[TRACKING] Started for order ${id} | initialEta = ${initialEta}m | expiresAt = ${order.trackingExpiresAt.toISOString()}`);
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

// ========== Create Stripe Payment Intent ==========
// POST /api/orders/:id/create-payment-intent
const createStripePaymentIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    console.log('[Payment] orderId:', id);
    console.log('[Payment] order.status:', order?.status);
    console.log('[Payment] user.id:', req.user?.id);
    console.log('[Payment] stripe configured:', Boolean(process.env.STRIPE_SECRET_KEY));

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

    // Amount always read from DB — never trusted from frontend
    const amountInCents = Math.round((order.totalPrice || order.price || 0) * 100);
    if (amountInCents <= 0) {
      return res.status(400).json({ msg: "Order has no valid price to charge" });
    }

    // Reuse existing PaymentIntent if still usable
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

    // Only the customer who owns the order can select a payment method
    if (req.user.id !== order.customerId?.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Only the customer on this order can select a payment method' });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({ msg: 'Payment method can only be selected after the order is completed' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ msg: 'This order has already been paid — payment method cannot be changed' });
    }

    // Prevent switching away from card if a PaymentIntent is already in flight
    // (requires_payment_method / requires_confirmation / requires_action).
    // Abandoning it would leave a dangling PI in Stripe.
    if (order.paymentMethod === 'card' && order.stripePaymentIntentId && paymentMethod !== 'card') {
      try {
        const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
          return res.status(400).json({
            msg: 'A card payment is already in progress. Complete or cancel it before switching to cash.',
          });
        }
      } catch (_) {
        // PI might be deleted in Stripe — allow switching
      }
    }

    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'pending';
    await order.save();

    // Notify the handyman that the customer has selected a payment method
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
};
