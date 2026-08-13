const mongoose = require('mongoose');
const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const { calculateRoute } = require('../utils/tomtom');
const { getThrottle, setThrottle } = require('./liveTrackingThrottle');
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
  const live = liveCustomerLocations.get(roomStr);
  if (live && Number.isFinite(live.lat) && Number.isFinite(live.lng)) {
    return { lat: live.lat, lng: live.lng, source: 'live-gps' };
  }

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
  io.to(roomStr).emit('handymanArrived', {
    orderId: roomStr,
    msg: 'الحرفي وصل إلى موقع العميل',
    distanceRemaining: 0,
    eta: 0,
  });
  console.log('[ARRIVAL CHECK] arrived = true | Emitted handymanArrived to room', roomStr);
  console.log('🧹 [BACKEND] Cleared customerLocations + route cache for order', roomStr);
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

/** Replay last known handyman GPS to a socket that joined late (e.g. customer) */
const replayHandymanLocationToSocket = (socket, roomStr, order) => {
  const stored = lastHandymanLocations.get(roomStr);
  if (!stored) return;
  if (!isGpsEntryFresh(stored)) {
    console.log('[REPLAY] Skipping stale handyman GPS | orderId =', roomStr, '| ageMs =', Date.now() - (stored.updatedAt ?? 0));
    return;
  }

  const lat = Number(stored.lat);
  const lng = Number(stored.lng);
  if (!isValidHandymanGps(lat, lng)) return;

  const origin = { lat, lng };
  const customerDest = order ? resolveCustomerDestination(order, roomStr) : null;
  const payload = {
    lat,
    lng,
    updatedAt: stored.updatedAt,
    replay: true,
    ...(customerDest ? buildCustomerFields(customerDest, origin) : {}),
  };

  console.log('[SOCKET AUDIT][HANDYMAN LOCATION REPLAY]', {
    targetSocketId: socket.id,
    room: roomStr,
    payload,
  });
  socket.emit('locationUpdate', payload);
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

        socket.emit('joinOrderRoomAck', {
          orderId,
          roomStr,
          role,
          success: true,
        });

        // Replay last known live GPS to late joiners.
        replayCustomerLocationToSocket(socket, roomStr);
        replayHandymanLocationToSocket(socket, roomStr, order);

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
      } catch(err) {
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

        const customerPoint = { lat: numLat, lng: numLng };
        storeCustomerLocation(roomStr, numLat, numLng);

        const customerDest = { lat: numLat, lng: numLng, source: 'live-gps' };
        invalidateRouteCacheIfNeeded(roomStr, customerDest);

        // ── 1. Broadcast live customer GPS to handyman (and others in room) ──
        await broadcastCustomerLocationUpdate(io, roomStr, numLat, numLng);

        const handymanPoint = lastHandymanLocations.get(roomStr) ?? null;
        console.log('[ROUTE INPUT] handyman =', handymanPoint ?? 'not yet received');
        console.log('[ROUTE INPUT] customer =', customerPoint, '(live-gps)');

        if (handymanPoint && isGpsEntryFresh(handymanPoint)) {
          const directMeters = haversineMeters(handymanPoint, customerPoint);
          console.log('[ROUTE INPUT] directDistanceMeters =', Math.round(directMeters));

          // ── Always deliver handyman coords BEFORE arrival check ──
          const baseUpdate = {
            lat: handymanPoint.lat,
            lng: handymanPoint.lng,
            ...buildCustomerFields(customerDest, handymanPoint),
          };
          await broadcastLocationUpdate(io, roomStr, baseUpdate, 'sendCustomerLocation');

          if (checkAndEmitArrival(io, roomStr, order, handymanPoint, customerPoint, 'sendCustomerLocation', {
            handymanEntry: handymanPoint,
            skipTripRecord: true,
          })) {
            return;
          }

          const { routePayload } = await maybeRecalculateRoute({
            orderId,
            roomStr,
            origin: handymanPoint,
            customerDest,
            directMeters,
            contextLabel: 'sendCustomerLocation',
          });

          if (Object.keys(routePayload).length > 0) {
            const updateData = {
              lat: handymanPoint.lat,
              lng: handymanPoint.lng,
              ...buildCustomerFields(customerDest, handymanPoint),
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
        // Join immediately so room membership exists before async order/auth work
        socket.join(roomStr);

        // If handyman already arrived for this order, ignore further location updates.
        if (arrivedOrders.has(roomStr)) {
          console.log('[SOCKET AUDIT][BACKEND BLOCKED] sendLocation — order already arrived:', roomStr);
          return;
        }

        const order = await Order.findById(orderId);
        if (!order) {
          console.warn(`❌ [Backend Socket Audit] Order not found: ${orderId}`);
          return socket.emit('error', { msg: 'Order not found' });
        }

        const userId = socket.user?._id?.toString();
        const isAssignedHandyman = userId && order.handymanId.toString() === userId;
        const isAdmin = socket.user?.isAdmin;
        if (!isAssignedHandyman && !isAdmin) {
          console.warn(`❌ [Backend Socket Audit] Unauthorized location update by user ${userId} for order ${orderId}`);
          return socket.emit('error', { msg: 'Not authorized to update this order\'s location' });
        }

        if (!['price_confirmed', 'in-progress'].includes(order.status)) {
            return socket.emit('error', { msg: 'Order status does not allow location updates' });
        }

        await logRoomMembers(io, roomStr, 'HANDYMAN ROOM MEMBERS (after handyman join on send)');

        const origin = { lat: numLat, lng: numLng };
        if (isActiveTrackingOrder(order)) {
          lastHandymanLocations.set(roomStr, { ...origin, updatedAt: Date.now() });
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

        io.to(orderId.toString()).emit('trackingStarted', {
          msg: ' الحرفي في الطريق!',
        });
        console.log(`📡 [Backend Socket Audit] Tracking started for order ${orderId}`);
      } catch(err) {
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
      } catch(err) {
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