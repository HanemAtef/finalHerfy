const { json } = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const Handyman = require("../models/Handyman");
const axios = require("axios");
const mongoose = require("mongoose");
const { createNotification } = require("./notificationController");

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

    if (customer.penaltyCount && customer.penaltyCount >= 3) {
      return res.status(403).json({
        msg: "You have been penalized for multiple cancellations. Please pay your fines to continue.",
      });
    }

    const handyman = await User.findOne({ _id: handymanId, role: "handyman" });
    if (!handyman) {
      return res.status(404).json({ msg: "Handyman not found" });
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
    let penaltyAmount = customer.penaltyAmount || 0;
    let totalPrice = finalPrice + penaltyAmount;

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

    // BUG FIX (C8): the customer's owed penalty used to be zeroed out here,
    // immediately on order creation, even though it was never actually
    // charged anywhere collectible (the fields that carried it were being
    // silently dropped, and even once persisted, nothing at payment time
    // referenced them). The penalty now stays on the customer's balance —
    // and is snapshotted onto this order's `penaltyAmount`/`totalPrice` —
    // until it's actually collected when cash payment is confirmed
    // (see confirmCashPayment).

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

    // SECURITY FIX (C4): route middleware only checked role, not ownership —
    // any authenticated customer could read any other customer's orders.
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

    const validStatuses = ["pending", "accepted", "price_confirmed", "in-progress", "completed", "cancelled"];
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

    // SECURITY FIX (C2): previously only the "cancelled + currentStatus===pending"
    // branch denied unrelated users — every other status (accepted, price_confirmed,
    // in-progress, disputed) had no ownership check at all, letting any
    // authenticated user cancel/mutate someone else's order. Require the caller
    // to be a party to this order (or an admin) up front, for every status.
    if (!isCustomer && !isHandyman && !isAdmin) {
      return res.status(403).json({ msg: "You are not authorized to update this order" });
    }

    const currentStatus = order.status;
    // FIX (M3): set true only when the "accepted" branch already
    // transactionally saved the order itself, so the shared final save
    // below doesn't redundantly (and non-atomically) overwrite it.
    let orderAlreadySaved = false;

    if (currentStatus === "completed") {
      return res.status(400).json({ msg: "Cannot update a completed order" });
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
        (currentStatus === "price_confirmed" || currentStatus === "in-progress") && isHandyman) {
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


      if (currentStatus === "in-progress" && isCustomer) {
        const customer = await User.findById(order.customerId);
        if (customer) {
          customer.penaltyCount = (customer.penaltyCount || 0) + 1;
          customer.penaltyAmount = (customer.penaltyAmount || 0) + 50;
          if (customer.penaltyCount >= 3) {
            customer.isPenalized = true;
          }
          await customer.save();
        }
        // ========== NOTIFICATION: Penalty warning ==========
        const io = req.app.get('io');
        await createNotification(
          io,
          order.customerId,
          'penalty_warning',
          ' Penalty Warning',
          `You have been charged a 50 EGP penalty. Total penalties: ${customer.penaltyCount}`,
          { orderId: order._id, penaltyCount: customer.penaltyCount }
        );
      }

      if (currentStatus === "completed") {
        return res.status(400).json({ msg: "Cannot cancel a completed order" });
      }
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
      // handyman could both read count < 3 before either write completed,
      // letting the 3-order cap be exceeded. Wrap the recheck + reservation
      // in a transaction so only one of them can win the last slot.
      // (Falls back to the old non-transactional check if the deployment's
      // MongoDB doesn't support transactions — e.g. a standalone dev
      // instance — so this can't break local/dev setups.)
      if (price !== undefined) {
        order.price = price;
      }
      order.status = "accepted";

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const raceCount = await Order.countDocuments({
            handymanId: order.handymanId,
            status: "in-progress",
          }).session(session);

          if (raceCount >= 3) {
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
            msg: "You have reached the maximum number of in-progress orders (3). Please complete one first.",
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
        if (inProgressOrders >= 3) {
          return res.status(400).json({
            msg: "You have reached the maximum number of in-progress orders (3). Please complete one first.",
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

      try {
        io.to(id).emit('tracking-started', {
          orderId: id,
          handymanName: req.user.name,
          message: 'Handyman is on the way!',
        });
        console.log(`Tracking started event sent for order ${id}`);
      } catch (error) {
        console.log('Socket.io error:', error.message);
      }
    }

    // ========== In-Progress Logic ==========
    if (status === "in-progress") {
      if (currentStatus !== "price_confirmed") {
        return res.status(400).json({ msg: "Order must be price confirmed before starting" });
      }
      if (!isHandyman && !isAdmin) {
        return res.status(403).json({ msg: "Only handyman can start work" });
      }

      const inProgressCount = await Order.countDocuments({
        handymanId: order.handymanId,
        status: "in-progress",
      });

      if (inProgressCount >= 3) {
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

      if (currentStatus !== "in-progress") {
        return res.status(400).json({ msg: "Order must be in-progress before it can be completed" });
      }

      const { completionImage } = req.body;
      if (!completionImage) {
        return res.status(400).json({ msg: "Completion proof image is required" });
      }
      order.completionImage = completionImage;
      order.paymentStatus = "unpaid";

      const commissionRate = order.commissionRate || 10;
      const commissionAmount = (order.price * commissionRate) / 100;
      const netAmount = order.price - commissionAmount;

      order.commissionAmount = commissionAmount;
      order.netAmount = netAmount;

      const inProgressCount = await Order.countDocuments({
        handymanId: order.handymanId,
        status: "in-progress",
      });

      if (inProgressCount < 3) {
        await Handyman.findOneAndUpdate(
          { userId: order.handymanId },
          { isAvailable: true }
        );
      }
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

    order.paymentStatus = "paid";
    order.paidAt = new Date();
    await order.save();

    // BUG FIX (C8): collect the penalty that was snapshotted onto this
    // order at creation time — this is the point the debt is actually
    // being paid in cash alongside the job, so this is when it should
    // come off the customer's outstanding balance (not at order creation).
    if (order.penaltyAmount > 0) {
      const customer = await User.findById(order.customerId);
      if (customer) {
        customer.penaltyAmount = Math.max(0, (customer.penaltyAmount || 0) - order.penaltyAmount);
        await customer.save();
      }
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
        handyman.suspendedReason = "رصيد العمولة المستحقة للمنصة تجاوز الحد المسموح";
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

    order.isHandymanOnTheWay = true;
    order.onTheWayAt = new Date();
    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('tracking-started', {
        orderId: id,
        handymanName: req.user.name,
        message: 'Handyman is on the way!',
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
  confirmCashPayment,
  markOnTheWay,
};