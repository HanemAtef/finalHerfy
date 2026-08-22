const mongoose = require('mongoose');
const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const { calculateRoute } = require('../utils/tomtom');
const { getThrottle, setThrottle, cleanupThrottle } = require('./liveTrackingThrottle');
const {
  ARRIVAL_THRESHOLD_METERS,
  ROUTE_CACHE_TOLERANCE_METERS,
  isActiveTrackingOrder,
  isGpsEntryFresh,
  createTripState,
  applyHandymanTripProgress,
  shouldAllowArrival,
  shouldInvalidateRouteCache,
  shouldRecalculateRoute,
  isRouteCacheValid,
  haversineMeters,
  GPS_REPLAY_MAX_AGE_MS,
} = require('./livetrackingHelpers');

const isValidId = (id) => typeof id === "string" && mongoose.isValidObjectId(id);

/** Single source of truth for Socket.IO order room names */
const toOrderRoomId = (orderId) => {
  if (orderId == null) return null;
  return orderId.toString();
};

/** Log sockets currently joined to an order room (Socket.IO v4+) */
const logRoomMembers = async (io, roomStr, label) => {
  try {
    const sockets = await io.in(roomStr).fetchSockets();
    const members = sockets.map((s) => ({
      socketId: s.id,
      userId: s.user?._id?.toString?.() ?? s.data?.userId ?? 'unknown',
      role: s.data?.trackingRooms?.get?.(roomStr) ?? s.data?.lastTrackingRole ?? 'unknown',
    }));
    console.log(`[SOCKET AUDIT] ${label}`, {
      room: roomStr,
      members,
      socketIds: members.map((m) => m.socketId),
    });
    return members;
  } catch (err) {
    console.warn('[SOCKET AUDIT] room member fetch failed', label, err.message);
    return [];
  }
};

/** Reject invalid / zero handyman GPS — never store fallback coordinates */
const isValidHandymanGps = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180 &&
  !(lat === 0 && lng === 0);

// In-memory Set: tracks orders where handymanArrived has already been emitted.
// Prevents duplicate arrival events per server lifecycle.
const arrivedOrders = new Set();

// In-memory Map: stores the last successful TomTom route per order.
// Keyed by orderId string. Cleared on arrival to prevent memory leaks.
// Structure: { eta, distance, geometry, trafficDelay, arrivalTime, etaTimestamp,
//              origin, destination, routeCalcTimestamp }
//
// Purpose: When TomTom is throttled (60s interval) or temporarily fails,
// the last trusted route is re-emitted ONLY if it still matches the current
// origin/destination. Stale routes are never reused after the handyman moves.
const lastTrustedRouteData = new Map();

// In-memory Map: live customer GPS sent from the customer app during tracking.
// Keyed by orderId string. Used as route destination when available.
// Alias: customerLocations (same Map — per product requirements)
const liveCustomerLocations = new Map();
const customerLocations = liveCustomerLocations;

// In-memory Map: latest handyman GPS per order (for arrival when customer location arrives second).
const lastHandymanLocations = new Map();

// Per-order trip progress for arrival guards (co-located start, en-route evidence).
const arrivalTripState = new Map();

const resolveCustomerDestination = (order, roomStr) => {
  // ── FIXED destination: always use order.customerLocation ──────────────────
  // This is the location captured at order creation and is the authoritative
  // routing/arrival target for the entire lifecycle of the order.
  // Customer live GPS (liveCustomerLocations) is stored for display only and
  // must NEVER become the route or arrival destination.
  if (
    order.customerLocation &&
    Array.isArray(order.customerLocation.coordinates) &&
    order.customerLocation.coordinates.length === 2
  ) {
    const [customerLng, customerLat] = order.customerLocation.coordinates;
    if (Number.isFinite(customerLat) && Number.isFinite(customerLng)) {
      return { lat: customerLat, lng: customerLng, source: 'order-db' };
    }
  }

  return null;
};

const getTripState = (roomStr) => {
  if (!arrivalTripState.has(roomStr)) {
    arrivalTripState.set(roomStr, createTripState());
  }
  return arrivalTripState.get(roomStr);
};

const recordHandymanTripProgress = (roomStr, handyman, customerDest) => {
  const updated = applyHandymanTripProgress(getTripState(roomStr), handyman, customerDest);
  arrivalTripState.set(roomStr, updated);
  return updated;
};

const invalidateRouteCacheIfNeeded = (roomStr, customerDest) => {
  const cached = lastTrustedRouteData.get(roomStr);
  if (!cached || !customerDest) return;
  if (shouldInvalidateRouteCache(cached, customerDest)) {
    console.log('[ROUTE] Cache invalidated — customer destination moved or source changed');
    lastTrustedRouteData.delete(roomStr);
  }
};

const buildTrustedRouteEntry = (routeData, origin, destination, now, destinationSource) => ({
  eta: routeData.eta,
  distance: routeData.distance,
  trafficDelay: routeData.trafficDelay,
  arrivalTime: routeData.arrivalTime,
  geometry: Array.isArray(routeData.geometry) && routeData.geometry.length >= 2
    ? routeData.geometry
    : null,
  etaTimestamp: now,
  routeCalcTimestamp: now,
  origin: { lat: origin.lat, lng: origin.lng },
  destination: { lat: destination.lat, lng: destination.lng },
  destinationSource,
});

const emitArrival = (io, roomStr) => {
  if (arrivedOrders.has(roomStr)) return;
  arrivedOrders.add(roomStr);
  lastTrustedRouteData.delete(roomStr);
  liveCustomerLocations.delete(roomStr);
  customerLocations.delete(roomStr);
  lastHandymanLocations.delete(roomStr);
  arrivalTripState.delete(roomStr);

  Order.findByIdAndUpdate(roomStr, { status: 'arrived', trackingStatus: 'stopped' }).catch((err) => {
    console.warn('[ARRIVAL DB UPDATE] failed:', err.message);
  });

  io.to(roomStr).emit('handymanArrived', {
    orderId: roomStr,
    msg: 'الحرفي وصل إلى موقع العميل',
    distanceRemaining: 0,
    eta: 0,
  });
  console.log('[ARRIVAL CHECK] arrived = true | Emitted handymanArrived to room', roomStr);
  console.log('🧹 [BACKEND] Cleared customerLocations + route cache for order', roomStr);
};

/** Single transition server-side expiration gate */
const checkAndEnforceTrackingTimeout = async (io, order, roomStr) => {
  if (!order) return true;

  if (order.trackingStatus === 'expired') {
    return true;
  }

  if (['arrived', 'completed', 'cancelled'].includes(order.status)) {
    return true;
  }

  if (order.trackingStatus === 'stopped' && !order.isHandymanOnTheWay && order.status !== 'in-progress') {
    return true;
  }

  const now = Date.now();
  const expiresMs = order.trackingExpiresAt ? new Date(order.trackingExpiresAt).getTime() : null;
  const isExpired = expiresMs != null && Number.isFinite(expiresMs) && now >= expiresMs;

  if (isExpired) {
    console.log(`[TRACKING Expired] Single transition active -> expired for order ${roomStr}`);
    order.trackingStatus = 'expired';
    await order.save();

    io.to(roomStr).emit('trackingExpired', {
      orderId: roomStr,
      msg: 'انتهت جلسة التتبع المباشر',
      trackingStatus: 'expired',
      orderStatus: order.status,
    });

    lastTrustedRouteData.delete(roomStr);
    liveCustomerLocations.delete(roomStr);
    customerLocations.delete(roomStr);
    lastHandymanLocations.delete(roomStr);
    arrivalTripState.delete(roomStr);
    cleanupThrottle(roomStr);

    return true;
  }

  return false;
};

/** Store live customer GPS in memory */
const storeCustomerLocation = (roomStr, lat, lng) => {
  const entry = { lat, lng, updatedAt: Date.now() };
  liveCustomerLocations.set(roomStr, entry);
  customerLocations.set(roomStr, entry);
  console.log('📍 [BACKEND] Customer live GPS stored | orderId =', roomStr, '| lat =', lat, '| lng =', lng);
  console.log('[BACKEND CUSTOMER GPS] orderId =', roomStr, '| lat =', lat, '| lng =', lng, '| source = live-gps');
};

/** Broadcast customer GPS to everyone in the order room (handyman + customer) */
const broadcastCustomerLocationUpdate = async (io, roomStr, lat, lng) => {
  const payload = {
    orderId: roomStr,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    source: 'live-gps',
  };
  const members = await logRoomMembers(io, roomStr, 'CUSTOMER ROOM MEMBERS');
  console.log('[SOCKET AUDIT][CUSTOMER LOCATION BROADCAST]', {
    room: roomStr,
    event: 'customerLocationUpdate',
    payload,
    targetSockets: members.map((m) => m.socketId),
  });
  io.to(roomStr).emit('customerLocationUpdate', payload);
};

/** Send stored customer location to a single socket (e.g. handyman joining late) */
const replayCustomerLocationToSocket = (socket, roomStr) => {
  const stored = liveCustomerLocations.get(roomStr);
  if (!stored) return;
  if (!isGpsEntryFresh(stored)) {
    console.log('[REPLAY] Skipping stale customer GPS | orderId =', roomStr, '| ageMs =', Date.now() - (stored.updatedAt ?? 0));
    return;
  }
  const payload = {
    orderId: roomStr,
    lat: stored.lat,
    lng: stored.lng,
    latitude: stored.lat,
    longitude: stored.lng,
    source: 'live-gps',
    updatedAt: stored.updatedAt,
    replay: true,
  };
  socket.emit('customerLocationUpdate', payload);
  console.log('[SOCKET AUDIT][CUSTOMER LOCATION REPLAY]', {
    targetSocketId: socket.id,
    room: roomStr,
    payload,
  });
  console.log('📤 [BACKEND] Replayed stored customer location to socket', socket.id, '| orderId =', roomStr);
};

/** Broadcast handyman lat/lng to everyone in the order room */
const broadcastLocationUpdate = async (io, roomStr, payload, source = 'unknown') => {
  const members = await logRoomMembers(io, roomStr, 'HANDYMAN ROOM MEMBERS (pre-broadcast)');
  console.log('[SOCKET AUDIT][HANDYMAN LOCATION BROADCAST]', {
    orderId: roomStr,
    room: roomStr,
    source,
    event: 'locationUpdate',
    payload,
    roomMembers: members,
    targetSocketIds: members.map((m) => m.socketId),
  });
  io.to(roomStr).emit('locationUpdate', payload);
};

/** Returns whether a socket is currently in an order room */
const verifySocketInRoom = async (io, socket, roomStr) => {
  const sockets = await io.in(roomStr).fetchSockets();
  const members = sockets.map((s) => ({
    socketId: s.id,
    userId: s.user?._id?.toString?.() ?? s.data?.userId ?? 'unknown',
    role: s.data?.trackingRooms?.get?.(roomStr) ?? s.data?.lastTrackingRole ?? 'unknown',
  }));
  return {
    actuallyInRoom: members.some((m) => m.socketId === socket.id),
    roomMembers: members,
  };
};

/** Replay last known handyman GPS to a socket that joined late (e.g. customer) */
const replayHandymanLocationToSocket = (socket, roomStr, order, role = 'unknown') => {
  const stored = lastHandymanLocations.get(roomStr);

  console.log('[DEBUG REPLAY] TARGET SOCKET', {
    id: socket.id,
    connected: socket.connected,
    role,
    orderId: roomStr,
  });

  if (!stored) {
    console.log('[DEBUG REPLAY] STORED HANDYMAN LOCATION', {
      key: roomStr,
      hasLocation: false,
      location: null,
      cacheKeys: [...lastHandymanLocations.keys()],
      cacheSize: lastHandymanLocations.size,
    });
    console.log('[SOCKET AUDIT][HANDYMAN LOCATION REPLAY] skipped — no stored handyman GPS', {
      socketId: socket.id,
      orderId: roomStr,
      roomStr,
    });
    return;
  }

  console.log('[DEBUG REPLAY] STORED HANDYMAN LOCATION', {
    key: roomStr,
    hasLocation: true,
    location: stored,
    orderId: roomStr,
    lat: stored.lat,
    lng: stored.lng,
    updatedAt: stored.updatedAt,
    ageMs: stored.updatedAt != null ? Date.now() - stored.updatedAt : null,
  });

  if (!isGpsEntryFresh(stored)) {
    console.log('[DEBUG REPLAY] STORED HANDYMAN LOCATION stale — replay skipped', {
      key: roomStr,
      ageMs: Date.now() - (stored.updatedAt ?? 0),
      maxAgeMs: GPS_REPLAY_MAX_AGE_MS,
    });
    console.log('[SOCKET AUDIT][HANDYMAN LOCATION REPLAY] skipped — stale handyman GPS', {
      socketId: socket.id,
      orderId: roomStr,
      roomStr,
      ageMs: Date.now() - (stored.updatedAt ?? 0),
      storedHandymanLocation: stored,
    });
    return;
  }

  const lat = Number(stored.lat);
  const lng = Number(stored.lng);
  if (!isValidHandymanGps(lat, lng)) {
    console.log('[DEBUG REPLAY] STORED HANDYMAN LOCATION invalid coords — replay skipped', {
      key: roomStr,
      lat,
      lng,
    });
    console.log('[SOCKET AUDIT][HANDYMAN LOCATION REPLAY] skipped — invalid stored coords', {
      socketId: socket.id,
      orderId: roomStr,
      roomStr,
      lat,
      lng,
    });
    return;
  }

  const origin = { lat, lng };
  const customerDest = order ? resolveCustomerDestination(order, roomStr) : null;
  const payload = {
    lat,
    lng,
    updatedAt: stored.updatedAt,
    replay: true,
    ...(customerDest ? buildCustomerFields(customerDest, origin) : {}),
  };

  console.log('[DEBUG REPLAY] ABOUT TO EMIT LOCATION', {
    targetSocketId: socket.id,
    orderId: roomStr,
    lat,
    lng,
    replay: true,
  });

  console.log('[SOCKET AUDIT][HANDYMAN LOCATION REPLAY]', {
    socketId: socket.id,
    orderId: roomStr,
    roomStr,
    replay: true,
    lat,
    lng,
    targetSocketId: socket.id,
    payload,
  });
  // Direct emit to joining socket — do NOT rely on room broadcast for replay
  socket.emit('locationUpdate', payload);

  console.log('[DEBUG REPLAY] LOCATION EMITTED', {
    targetSocketId: socket.id,
    orderId: roomStr,
  });
  console.log('📤 [BACKEND] Replayed stored handyman location to socket', socket.id, '| orderId =', roomStr);
};

/** Base customer fields always attached to locationUpdate when destination is known */
const buildCustomerFields = (customerDest, origin) => {
  if (!customerDest) return {};
  const directMeters = origin ? haversineMeters(origin, customerDest) : null;
  return {
    customerLat: customerDest.lat,
    customerLng: customerDest.lng,
    destinationSource: customerDest.source,
    directDistanceMeters: directMeters != null ? Math.round(directMeters) : null,
  };
};

/** Attach geometry under both keys for frontend compatibility */
const withRouteGeometryAliases = (payload, geometry) => {
  if (!Array.isArray(geometry) || geometry.length < 2) return payload;
  return { ...payload, geometry, routeGeometry: geometry };
};

const checkAndEmitArrival = (io, roomStr, order, handyman, customer, context, options = {}) => {
  const { handymanEntry = null, skipTripRecord = false } = options;
  if (!handyman || !customer || arrivedOrders.has(roomStr)) return false;

  if (!isActiveTrackingOrder(order)) {
    console.log(`[ARRIVAL CHECK] ${context} | blocked — order not in active tracking (on-the-way / in-progress)`);
    return false;
  }

  if (handymanEntry && !isGpsEntryFresh(handymanEntry)) {
    console.log(`[ARRIVAL CHECK] ${context} | blocked — stale handyman GPS for arrival`);
    return false;
  }

  if (!skipTripRecord) {
    recordHandymanTripProgress(roomStr, handyman, customer);
  }

  const directMeters = haversineMeters(handyman, customer);
  console.log(`[ARRIVAL CHECK] ${context} | directDistanceMeters = ${Math.round(directMeters)} | threshold = ${ARRIVAL_THRESHOLD_METERS}m`);

  if (directMeters > ARRIVAL_THRESHOLD_METERS) {
    console.log(`[ARRIVAL CHECK] arrived = false | ${(directMeters / 1000).toFixed(2)} km direct remaining`);
    return false;
  }

  const tripState = getTripState(roomStr);
  if (!shouldAllowArrival(tripState, handyman, directMeters)) {
    console.log('[ARRIVAL CHECK] blocked — co-located at trip start (waiting for en-route / movement / min tracking time)', {
      maxDirectMeters: Math.round(tripState.maxDirectMeters),
      handymanUpdates: tripState.handymanUpdateCount,
    });
    return false;
  }

  emitArrival(io, roomStr);
  return true;
};

/** Shared TomTom recalc — same throttle/cache rules for sendLocation and sendCustomerLocation */
const maybeRecalculateRoute = async ({
  orderId,
  roomStr,
  origin,
  customerDest,
  directMeters,
  contextLabel,
}) => {
  if (!customerDest || directMeters <= ARRIVAL_THRESHOLD_METERS) {
    return { routeData: null, routePayload: {} };
  }

  const now = Date.now();
  const lastCalc = getThrottle(orderId);
  const intervalSec = parseInt(process.env.ETA_RECALCULATION_INTERVAL_SEC, 10) || 60;
  const cached = lastTrustedRouteData.get(roomStr) ?? null;
  const cacheStillValid = cached && isRouteCacheValid(cached, origin, customerDest, customerDest.source);
  const throttleExpired = now - lastCalc > intervalSec * 1000;
  const shouldRecalc = shouldRecalculateRoute({ throttleExpired, cacheStillValid });

  if (!shouldRecalc) {
    const remainingSec = Math.ceil((intervalSec * 1000 - (now - lastCalc)) / 1000);
    console.log(`⏳ [ROUTE] TomTom throttled (${contextLabel}) — reusing valid cache | remaining = ${remainingSec}s`);
    if (cacheStillValid) {
      return {
        routeData: null,
        routePayload: withRouteGeometryAliases({
          distanceRemaining: cached.distance,
          eta: cached.eta,
          trafficDelay: cached.trafficDelay,
          arrivalTime: cached.arrivalTime,
          etaTimestamp: cached.etaTimestamp,
          routeCalcTimestamp: cached.routeCalcTimestamp,
        }, cached.geometry),
      };
    }
    return { routeData: null, routePayload: {} };
  }

  if (!throttleExpired && !cacheStillValid) {
    console.log(`[ROUTE] Forcing TomTom recalc (${contextLabel}) — cached route no longer matches coordinates`);
  } else {
    console.log(`[ROUTE] TomTom recalc (${contextLabel})`);
  }

  console.log(`\n[ROUTE] TomTom request | origin=(${origin.lat}, ${origin.lng}) -> dest=(${customerDest.lat}, ${customerDest.lng}) [${customerDest.source}]`);
  setThrottle(orderId, now);

  let routeData = null;
  try {
    routeData = await calculateRoute(origin, customerDest);
    if (routeData && routeData.distance !== null) {
      const routeMeters = routeData.distance * 1000;
      if (directMeters < 500 && routeMeters > directMeters * 10 + 500) {
        console.warn('[ROUTE RESULT] REJECTED — TomTom distance inconsistent with direct', Math.round(directMeters), 'm');
        routeData = null;
        lastTrustedRouteData.delete(roomStr);
      } else {
        const trusted = buildTrustedRouteEntry(routeData, origin, customerDest, now, customerDest.source);
        lastTrustedRouteData.set(roomStr, trusted);
      }
    } else {
      routeData = null;
      if (!cacheStillValid) lastTrustedRouteData.delete(roomStr);
    }
  } catch (err) {
    console.error(`[ROUTE] TomTom error (${contextLabel}):`, err.message);
    routeData = null;
    if (!cacheStillValid) lastTrustedRouteData.delete(roomStr);
  }

  if (!routeData || routeData.distance == null) {
    return { routeData: null, routePayload: {} };
  }

  return {
    routeData,
    routePayload: withRouteGeometryAliases({
      distanceRemaining: routeData.distance,
      eta: routeData.eta,
      trafficDelay: routeData.trafficDelay,
      arrivalTime: routeData.arrivalTime,
      etaTimestamp: now,
      routeCalcTimestamp: now,
    }, routeData.geometry),
  };
};

const liveTrackingSocket = (io) => {
  io.on('connection', (socket) => {
    const socketRole = socket.user?.role ?? 'unknown';
    console.log('[SOCKET AUDIT][BACKEND SOCKET]', {
      socketId: socket.id,
      role: socketRole,
      userId: socket.user?._id?.toString(),
    });

    socket.on('joinOrderRoom', async (orderId) => {
      try {
        if (!isValidId(orderId)) {
          socket.emit('joinOrderRoomAck', { orderId, success: false, reason: 'invalid_order_id' });
          return socket.emit('error', { msg: 'Invalid order id' });
        }

        const roomStr = toOrderRoomId(orderId);
        // Join immediately so broadcasts are not missed during async order/auth work
        socket.join(roomStr);

        const order = await Order.findById(orderId);
        if (!order) {
          socket.leave(roomStr);
          console.warn(`⚠️ [Backend Socket Audit] joinOrderRoom order not found: ${orderId}`);
          socket.emit('joinOrderRoomAck', { orderId, success: false, reason: 'order_not_found' });
          return;
        }

        const userId = socket.user?._id?.toString();
        const allowed =
          userId &&
          (order.customerId.toString() === userId || order.handymanId.toString() === userId);

        if (!allowed) {
          socket.leave(roomStr);
          console.warn(`⚠️ [Backend Socket Audit] joinOrderRoom unauthorized user: ${userId}`);
          socket.emit('joinOrderRoomAck', {
            orderId,
            success: false,
            reason: 'unauthorized',
            userId,
          });
          return;
        }

        const role =
          userId === order.customerId.toString()
            ? 'customer'
            : userId === order.handymanId.toString()
              ? 'handyman'
              : 'admin';

        console.log('[SOCKET AUDIT] joinOrderRoom', {
          socketId: socket.id,
          orderId,
          roomStr,
          role,
        });
        if (!socket.data.trackingRooms) {
          socket.data.trackingRooms = new Map();
        }
        socket.data.trackingRooms.set(roomStr, role);
        socket.data.lastTrackingRole = role;

        await logRoomMembers(io, roomStr, 'ROOM MEMBERS AFTER JOIN');

        const storedHandyman = lastHandymanLocations.get(roomStr) ?? null;
        console.log('[SOCKET AUDIT][JOIN REPLAY START]', {
          socketId: socket.id,
          orderId,
          roomStr,
          hasStoredHandymanLocation: storedHandyman != null,
          storedHandymanLocation: storedHandyman,
        });

        if (role === 'customer') {
          console.log('[DEBUG REPLAY] CUSTOMER JOIN', {
            socketId: socket.id,
            orderId,
            room: roomStr,
            role,
          });
          console.log('[DEBUG REPLAY] STORED HANDYMAN LOCATION', {
            hasLocation: storedHandyman != null,
            location: storedHandyman,
            key: roomStr,
            cacheKeys: [...lastHandymanLocations.keys()],
            ...(storedHandyman
              ? {
                orderId: roomStr,
                lat: storedHandyman.lat,
                lng: storedHandyman.lng,
                updatedAt: storedHandyman.updatedAt,
              }
              : {}),
          });
        }

        socket.emit('joinOrderRoomAck', {
          orderId,
          roomStr,
          role,
          success: true,
        });

        // Replay last known live GPS directly to this socket (late joiner).
        replayCustomerLocationToSocket(socket, roomStr);
        replayHandymanLocationToSocket(socket, roomStr, order, role);

        const roomVerified = await verifySocketInRoom(io, socket, roomStr);
        console.log('[SOCKET AUDIT][JOIN ROOM VERIFIED]', {
          socketId: socket.id,
          roomStr,
          actuallyInRoom: roomVerified.actuallyInRoom,
          roomMembers: roomVerified.roomMembers,
        });

        await logRoomMembers(io, roomStr, 'ROOM MEMBERS AFTER REPLAY');

        // If this order has already been marked as arrived (e.g. after reconnect),
        // re-emit arrival so customer rejoining can get the state.
        if (arrivedOrders.has(roomStr)) {
          socket.emit('handymanArrived', { orderId: roomStr });
          console.log(`✅ [Arrival] Re-emitted handymanArrived to rejoining socket for order ${roomStr}`);
        }
      } catch (err) {
        console.error("joinOrderRoom failed:", err.message);
      }
    });

    // leave order room
    socket.on('leaveOrderRoom', (orderId) => {
      try {
        if (!orderId) return;
        const roomStr = toOrderRoomId(orderId);
        socket.leave(roomStr);
        socket.data.trackingRooms?.delete?.(roomStr);
        console.log(`[SOCKET AUDIT] leaveOrderRoom`, { socketId: socket.id, room: roomStr });
      } catch (err) {
        console.error("leaveOrderRoom failed:", err.message);
      }
    });

    // Customer sends live GPS so route destination matches the map marker
    socket.on('sendCustomerLocation', async (data) => {
      try {
        const { orderId, lat, lng, latitude, longitude } = data || {};
        const numLat = Number(lat ?? latitude);
        const numLng = Number(lng ?? longitude);

        console.log('📥 [BACKEND] sendCustomerLocation received | orderId =', orderId, '| lat =', numLat, '| lng =', numLng);

        if (!isValidId(orderId)) {
          return socket.emit('error', { msg: 'Invalid order id' });
        }
        if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
          return socket.emit('error', { msg: 'Invalid customer location data' });
        }

        const roomStr = toOrderRoomId(orderId);
        // Join immediately — customer may emit before joinOrderRoom ack completes
        socket.join(roomStr);

        const order = await Order.findById(orderId);
        if (!order) {
          console.warn('📍 [BACKEND] sendCustomerLocation — order not found:', orderId);
          return;
        }

        if (await checkAndEnforceTrackingTimeout(io, order, roomStr)) {
          console.log('[SOCKET AUDIT][BACKEND BLOCKED] sendCustomerLocation — order tracking expired or stopped:', roomStr);
          return;
        }

        const userId = socket.user?._id?.toString();
        const isCustomer = userId && order.customerId.toString() === userId;
        if (!isCustomer && !socket.user?.isAdmin) {
          console.warn('📍 [BACKEND] sendCustomerLocation unauthorized | userId =', userId, '| orderId =', orderId);
          return;
        }

        if (arrivedOrders.has(roomStr)) {
          console.log('[SOCKET AUDIT][BACKEND BLOCKED] sendCustomerLocation — order already arrived:', roomStr);
          return;
        }

        console.log('[SOCKET AUDIT][BACKEND CUSTOMER RECEIVED]', {
          socketId: socket.id,
          orderId,
          room: roomStr,
          lat: numLat,
          lng: numLng,
        });

        await logRoomMembers(io, roomStr, 'CUSTOMER ROOM MEMBERS (after customer join on send)');

        // Store and broadcast live customer GPS for map display on the handyman side.
        storeCustomerLocation(roomStr, numLat, numLng);

        // ── 1. Broadcast live customer GPS to handyman (and others in room) ──
        await broadcastCustomerLocationUpdate(io, roomStr, numLat, numLng);

        // ── Fixed destination: always from order.customerLocation ─────────────
        // Live GPS is displayed on the map but MUST NOT be used for routing/arrival.
        const fixedDest = resolveCustomerDestination(order, roomStr);
        if (!fixedDest) {
          console.log('[sendCustomerLocation] No fixed order destination available — skipping route/arrival');
          return;
        }

        invalidateRouteCacheIfNeeded(roomStr, fixedDest);

        const handymanPoint = lastHandymanLocations.get(roomStr) ?? null;
        console.log('[ROUTE INPUT] handyman =', handymanPoint ?? 'not yet received');
        console.log('[ROUTE INPUT] customer (fixed order dest) =', fixedDest, '| live GPS (display only) = { lat:', numLat, ', lng:', numLng, '}');

        if (handymanPoint && isGpsEntryFresh(handymanPoint)) {
          const directMeters = haversineMeters(handymanPoint, fixedDest);
          console.log('[ROUTE INPUT] directDistanceMeters (to fixed dest) =', Math.round(directMeters));

          // ── Always deliver handyman coords BEFORE arrival check ──
          const baseUpdate = {
            lat: handymanPoint.lat,
            lng: handymanPoint.lng,
            ...buildCustomerFields(fixedDest, handymanPoint),
          };
          await broadcastLocationUpdate(io, roomStr, baseUpdate, 'sendCustomerLocation');

          if (checkAndEmitArrival(io, roomStr, order, handymanPoint, fixedDest, 'sendCustomerLocation', {
            handymanEntry: handymanPoint,
            skipTripRecord: true,
          })) {
            return;
          }

          const { routePayload } = await maybeRecalculateRoute({
            orderId,
            roomStr,
            origin: handymanPoint,
            customerDest: fixedDest,
            directMeters,
            contextLabel: 'sendCustomerLocation',
          });

          if (Object.keys(routePayload).length > 0) {
            const updateData = {
              lat: handymanPoint.lat,
              lng: handymanPoint.lng,
              ...buildCustomerFields(fixedDest, handymanPoint),
              ...routePayload,
            };
            await broadcastLocationUpdate(io, roomStr, updateData, 'sendCustomerLocation-route');
            console.log('📍 [BACKEND] Sending route-enriched locationUpdate | orderId =', roomStr);
            console.log('  customerLat =', updateData.customerLat, '| customerLng =', updateData.customerLng);
            console.log('  distanceRemaining =', updateData.distanceRemaining ?? 'N/A');
            console.log('  geometry points =', Array.isArray(updateData.geometry) ? updateData.geometry.length : 0);
          }
        } else if (handymanPoint && !isGpsEntryFresh(handymanPoint)) {
          console.log('[BACKEND] Ignoring stale stored handyman GPS for sendCustomerLocation route/arrival | orderId =', roomStr);
        }
      } catch (err) {
        console.error('sendCustomerLocation failed:', err.message);
      }
    });

    // sendLocation
    socket.on('sendLocation', async (data) => {
      try {
        const { orderId, lat, lng } = data || {};
        const numLat = Number(lat);
        const numLng = Number(lng);

        const roomStrEarly = isValidId(orderId) ? toOrderRoomId(orderId) : null;
        console.log('[SOCKET AUDIT][BACKEND HANDYMAN RECEIVED]', {
          socketId: socket.id,
          orderId,
          room: roomStrEarly,
          lat: numLat,
          lng: numLng,
        });

        if (!isValidId(orderId)) {
          return socket.emit('error', { msg: 'Invalid order id' });
        }

        if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
          console.warn(`❌ [BACKEND REJECT] sendLocation invalid numbers | order ${orderId}`);
          return socket.emit('error', { msg: 'Invalid location data. Latitude and longitude must be valid numbers.' });
        }

        if (!isValidHandymanGps(numLat, numLng)) {
          console.warn(`❌ [BACKEND REJECT] sendLocation invalid GPS | order ${orderId} | lat=${numLat} lng=${numLng}`);
          return socket.emit('error', { msg: 'Invalid GPS coordinates. No fallback location stored.' });
        }

        const roomStr = toOrderRoomId(orderId);

        const trackingRole = socket.data?.trackingRooms?.get?.(roomStr);
        if (!trackingRole || trackingRole !== 'handyman') {
          console.warn(`❌ [BACKEND REJECT] sendLocation — Socket ${socket.id} not joined as handyman to room ${roomStr}`);
          socket.emit('sendLocationError', { msg: 'Socket not joined or authorized for this order room' });
          return socket.emit('error', { msg: 'Socket not joined or authorized for this order room' });
        }

        // If handyman already arrived for this order, ignore further location updates.
        if (arrivedOrders.has(roomStr)) {
          console.log('[SOCKET AUDIT][BACKEND BLOCKED] sendLocation — order already arrived:', roomStr);
          return;
        }

        const order = await Order.findById(orderId);
        if (!order) {
          console.warn(`❌ [Backend Socket Audit] Order not found: ${orderId}`);
          socket.emit('sendLocationError', { msg: 'Order not found' });
          return socket.emit('error', { msg: 'Order not found' });
        }

        if (await checkAndEnforceTrackingTimeout(io, order, roomStr)) {
          console.log('[SOCKET AUDIT][BACKEND BLOCKED] sendLocation — order tracking expired or stopped:', roomStr);
          return;
        }

        const userId = socket.user?._id?.toString();
        const isAssignedHandyman = userId && order.handymanId.toString() === userId;
        const isAdmin = socket.user?.isAdmin;
        if (!isAssignedHandyman && !isAdmin) {
          console.warn(`❌ [Backend Socket Audit] Unauthorized location update by user ${userId} for order ${orderId}`);
          socket.emit('sendLocationError', { msg: 'Not authorized to update this order\'s location' });
          return socket.emit('error', { msg: 'Not authorized to update this order\'s location' });
        }

        if (!isActiveTrackingOrder(order)) {
          console.warn(`❌ [BACKEND REJECT] sendLocation — Order ${orderId} is not an active tracking order (status=${order.status}, trackingStatus=${order.trackingStatus}, onTheWay=${order.isHandymanOnTheWay})`);
          socket.emit('sendLocationError', { msg: 'Order status does not allow location updates' });
          return socket.emit('error', { msg: 'Order status does not allow location updates' });
        }

        // BUSINESS RULE: Handyman may ONLY track ONE active order at a time.
        const handymanOrders = await Order.find({
          handymanId: order.handymanId,
          _id: { $ne: order._id },
          isHandymanOnTheWay: true,
          status: { $in: ['price_confirmed', 'in-progress'] },
        });

        const activeOtherOrder = handymanOrders.find((o) => isActiveTrackingOrder(o));

        if (activeOtherOrder) {
          console.warn(`❌ [BACKEND REJECT] sendLocation — Handyman ${order.handymanId} has active tracking on another order ${activeOtherOrder._id}`);
          socket.emit('sendLocationError', { msg: 'Another order is currently active for live tracking' });
          return socket.emit('error', { msg: 'Another order is currently active for live tracking' });
        }

        await logRoomMembers(io, roomStr, 'HANDYMAN ROOM MEMBERS (sending location)');

        const origin = { lat: numLat, lng: numLng };
        if (isActiveTrackingOrder(order)) {
          lastHandymanLocations.set(roomStr, { ...origin, updatedAt: Date.now() });
        } else {
          console.log('[DEBUG REPLAY] HANDYMAN LOCATION NOT STORED for replay cache', {
            orderId,
            roomStr,
            status: order.status,
            isHandymanOnTheWay: order.isHandymanOnTheWay ?? null,
            reason: 'isActiveTrackingOrder=false',
            lat: numLat,
            lng: numLng,
          });
        }

        const customerDest = resolveCustomerDestination(order, roomStr);

        console.log('[ROUTE INPUT] handyman =', origin);
        console.log('[ROUTE INPUT] customer =', customerDest ?? 'N/A');
        if (customerDest) {
          const directMeters = haversineMeters(origin, customerDest);
          console.log('[ROUTE INPUT] directDistanceMeters =', Math.round(directMeters), '| customer source =', customerDest.source);
        }

        // ─── Always broadcast handyman coords BEFORE arrival check ───────────
        const baseHandymanUpdate = {
          lat: numLat,
          lng: numLng,
          ...(customerDest ? buildCustomerFields(customerDest, origin) : {}),
        };
        await broadcastLocationUpdate(io, roomStr, baseHandymanUpdate, 'sendLocation');

        if (customerDest && checkAndEmitArrival(io, roomStr, order, origin, customerDest, 'sendLocation')) {
          return;
        }

        let routeData = null;
        let routePayloadFromCalc = {};
        if (customerDest) {
          const directMeters = haversineMeters(origin, customerDest);
          if (directMeters <= ARRIVAL_THRESHOLD_METERS) {
            console.log('[ROUTE] Skipping TomTom — direct distance', Math.round(directMeters), 'm (within arrival threshold)');
            if (checkAndEmitArrival(io, roomStr, order, origin, customerDest, 'pre-tomtom-guard', { skipTripRecord: true })) {
              return;
            }
          } else {
            const result = await maybeRecalculateRoute({
              orderId,
              roomStr,
              origin,
              customerDest,
              directMeters,
              contextLabel: 'sendLocation',
            });
            routeData = result.routeData;
            routePayloadFromCalc = result.routePayload;
          }
        }

        // update handyman live location (only valid numeric coordinates)
        order.handymanLiveLocation = {
          type: 'Point',
          coordinates: [numLng, numLat],
          updatedAt: new Date()
        };

        // save ETA and distance only if routeData is valid (non-null distance)
        if (routeData && routeData.distance !== null) {
          if (order.eta !== null && order.eta !== undefined && Math.abs(routeData.eta - order.eta) <= 2) {
            routeData.eta = order.eta;
          }
          order.eta = routeData.eta;
          order.distanceRemaining = routeData.distance;
          order.trafficDelay = routeData.trafficDelay;
          order.arrivalTime = routeData.arrivalTime;
        }

        await order.save();

        let routePayload = {};
        if (routeData && routeData.distance !== null) {
          const ts = Date.now();
          routePayload = withRouteGeometryAliases({
            distanceRemaining: routeData.distance,
            eta: routeData.eta,
            trafficDelay: routeData.trafficDelay,
            arrivalTime: routeData.arrivalTime,
            etaTimestamp: ts,
            routeCalcTimestamp: ts,
            routeOrigin: origin,
            routeDestination: { lat: customerDest.lat, lng: customerDest.lng },
          }, routeData.geometry);
        } else if (Object.keys(routePayloadFromCalc).length > 0) {
          routePayload = routePayloadFromCalc;
        } else {
          const trusted = lastTrustedRouteData.get(roomStr) ?? null;
          const cacheValidForEmit = trusted && customerDest && isRouteCacheValid(trusted, origin, customerDest, customerDest.source);
          if (cacheValidForEmit) {
            console.log('[ROUTE] Using valid cached route | routeCalcTimestamp =', new Date(trusted.routeCalcTimestamp).toISOString());
            routePayload = withRouteGeometryAliases({
              distanceRemaining: trusted.distance,
              eta: trusted.eta,
              trafficDelay: trusted.trafficDelay,
              arrivalTime: trusted.arrivalTime,
              etaTimestamp: trusted.etaTimestamp,
              routeCalcTimestamp: trusted.routeCalcTimestamp,
              routeOrigin: trusted.origin,
              routeDestination: trusted.destination,
            }, trusted.geometry);
          } else if (trusted) {
            console.warn('[ROUTE] Stale cache discarded — not attaching old distance/geometry to locationUpdate');
          }
        }

        const updateData = {
          lat: numLat,
          lng: numLng,
          ...(customerDest ? buildCustomerFields(customerDest, origin) : {}),
          ...routePayload,
        };

        // Route-enriched update (base lat/lng already broadcast above)
        if (Object.keys(routePayload).length > 0) {
          await broadcastLocationUpdate(io, roomStr, updateData, 'sendLocation-route');
        }
        socket.emit('locationSent', { success: true, data: updateData });

        console.log(`\n📍 [BACKEND] sendLocation complete | room ${roomStr}`);
        console.log('  handyman =', { lat: numLat, lng: numLng });
        console.log('  customerLat =', updateData.customerLat ?? 'N/A', '| customerLng =', updateData.customerLng ?? 'N/A');
        console.log('  destinationSource =', updateData.destinationSource ?? 'N/A');
        console.log('  directDistanceMeters =', updateData.directDistanceMeters ?? 'N/A');
        console.log('  distanceRemaining =', updateData.distanceRemaining ?? 'N/A');
        console.log('  eta =', updateData.eta ?? 'N/A');
        console.log('  geometry points =', Array.isArray(updateData.geometry) ? updateData.geometry.length : 'null');
        console.log('  routeCalcTimestamp =', updateData.routeCalcTimestamp ? new Date(updateData.routeCalcTimestamp).toISOString() : 'N/A');

      } catch (err) {
        console.error("sendLocation failed:", err.message);
      }
    });

    //live tracking events
    socket.on('startTracking', async (orderId) => {
      try {
        if (!isValidId(orderId)) return;
        const order = await Order.findById(orderId);
        if (!order) return;
        const userId = socket.user?._id?.toString();
        if (userId && order.handymanId.toString() !== userId && !socket.user?.isAdmin) {
          return;
        }

        const roomStr = orderId.toString();
        socket.join(roomStr);

        // CRITICAL RULE 2: startTracking is NOT a start owner.
        // It MUST NOT initialize trackingStartedAt or trackingExpiresAt or extend expiration!
        if (order.trackingStatus === 'expired' || (order.trackingExpiresAt && Date.now() >= new Date(order.trackingExpiresAt).getTime())) {
          console.log(`[TRACKING REJECT] startTracking ignored — tracking is expired for order ${orderId}`);
          return;
        }
        if (order.trackingStatus === 'stopped' || ['arrived', 'completed', 'cancelled'].includes(order.status)) {
          console.log(`[TRACKING REJECT] startTracking ignored — tracking is stopped/terminal for order ${orderId}`);
          return;
        }

        io.to(roomStr).emit('trackingStarted', {
          msg: ' الحرفي في الطريق!',
          orderId: roomStr,
          trackingStatus: order.trackingStatus,
          trackingStartedAt: order.trackingStartedAt,
          trackingExpiresAt: order.trackingExpiresAt,
        });
        console.log(`📡 [Backend Socket Audit] Tracking room confirmed for order ${orderId}`);
      } catch (err) {
        console.error("startTracking failed:", err.message);
      }
    });

    //stop tracking event (manual, kept for backward compat)
    socket.on('stopTracking', async (orderId) => {
      try {
        if (!isValidId(orderId)) return;
        const order = await Order.findById(orderId);
        if (!order) return;
        const userId = socket.user?._id?.toString();
        if (userId && order.handymanId.toString() !== userId && !socket.user?.isAdmin) {
          return;
        }

        io.to(orderId.toString()).emit('trackingStopped', {
          msg: ' الحرفي وصل!',
        });
        const roomStr = orderId.toString();
        lastTrustedRouteData.delete(roomStr);
        liveCustomerLocations.delete(roomStr);
        customerLocations.delete(roomStr);
        lastHandymanLocations.delete(roomStr);
        arrivalTripState.delete(roomStr);
        console.log(`📡 [Backend Socket Audit] Tracking stopped for order ${orderId}`);
        console.log('🧹 [BACKEND] Cleared customerLocations + route cache on stopTracking for order', roomStr);
      } catch (err) {
        console.error("stopTracking failed:", err.message);
      }
    });

    // disconnect event
    socket.on('disconnect', () => {
      console.log('⚡ [Backend Socket Audit] Client disconnected:', socket.id);
    });
  });
};

module.exports = liveTrackingSocket;
module.exports.__internals = {
  checkAndEmitArrival,
  maybeRecalculateRoute,
  invalidateRouteCacheIfNeeded,
  recordHandymanTripProgress,
  getTripState,
  arrivedOrders,
  lastTrustedRouteData,
  lastHandymanLocations,
  liveCustomerLocations,
  arrivalTripState,
  emitArrival,
};