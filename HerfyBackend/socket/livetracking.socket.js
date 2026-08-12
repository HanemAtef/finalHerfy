const mongoose = require('mongoose');
const Order = require('../models/Order');
const Handyman = require('../models/Handyman');
const { calculateRoute } = require('../utils/tomtom');
const { getThrottle, setThrottle } = require('./liveTrackingThrottle');

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


// Haversine distance in meters between two { lat, lng } points
const haversineMeters = (a, b) => {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const chord =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
};

const ARRIVAL_THRESHOLD_METERS = 50;
// Reuse cached TomTom route only when origin/destination haven't moved beyond this.
const ROUTE_CACHE_TOLERANCE_METERS = 100;

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

const isRouteCacheValid = (trusted, origin, destination, destinationSource) => {
  if (!trusted?.origin || !trusted?.destination) return false;
  // Never reuse a route calculated against a different destination source (DB vs live GPS)
  if (trusted.destinationSource && destinationSource && trusted.destinationSource !== destinationSource) {
    console.log('[ROUTE] Cache INVALID — destination source changed:', trusted.destinationSource, '→', destinationSource);
    return false;
  }
  const originDrift = haversineMeters(trusted.origin, origin);
  const destDrift = haversineMeters(trusted.destination, destination);
  const valid =
    originDrift <= ROUTE_CACHE_TOLERANCE_METERS &&
    destDrift <= ROUTE_CACHE_TOLERANCE_METERS;
  if (!valid) {
    console.log('[ROUTE] Cache INVALID — origin drift =', Math.round(originDrift), 'm | dest drift =', Math.round(destDrift), 'm');
  }
  return valid;
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
  const payload = {
    orderId: roomStr,
    lat: stored.lat,
    lng: stored.lng,
    latitude: stored.lat,
    longitude: stored.lng,
    source: 'live-gps',
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
const broadcastLocationUpdate = async (io, roomStr, payload) => {
  const members = await logRoomMembers(io, roomStr, 'HANDYMAN ROOM MEMBERS');
  console.log('[SOCKET AUDIT][HANDYMAN LOCATION BROADCAST]', {
    room: roomStr,
    event: 'locationUpdate',
    payload,
    targetSockets: members.map((m) => m.socketId),
  });
  io.to(roomStr).emit('locationUpdate', payload);
};

/** Replay last known handyman GPS to a socket that joined late (e.g. customer) */
const replayHandymanLocationToSocket = (socket, roomStr, order) => {
  const stored = lastHandymanLocations.get(roomStr);
  if (!stored) return;

  const lat = Number(stored.lat);
  const lng = Number(stored.lng);
  if (!isValidHandymanGps(lat, lng)) return;

  const origin = { lat, lng };
  const customerDest = order ? resolveCustomerDestination(order, roomStr) : null;
  const payload = {
    lat,
    lng,
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

const checkAndEmitArrival = (io, roomStr, handyman, customer, context) => {
  if (!handyman || !customer || arrivedOrders.has(roomStr)) return false;
  const directMeters = haversineMeters(handyman, customer);
  console.log(`[ARRIVAL CHECK] ${context} | directDistanceMeters = ${Math.round(directMeters)} | threshold = ${ARRIVAL_THRESHOLD_METERS}m`);
  if (directMeters <= ARRIVAL_THRESHOLD_METERS) {
    emitArrival(io, roomStr);
    return true;
  }
  console.log(`[ARRIVAL CHECK] arrived = false | ${(directMeters / 1000).toFixed(2)} km direct remaining`);
  return false;
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

        const order = await Order.findById(orderId);
        if (!order) {
          console.warn(`⚠️ [Backend Socket Audit] joinOrderRoom order not found: ${orderId}`);
          socket.emit('joinOrderRoomAck', { orderId, success: false, reason: 'order_not_found' });
          return;
        }

        const userId = socket.user?._id?.toString();
        const allowed =
          userId &&
          (order.customerId.toString() === userId || order.handymanId.toString() === userId);

        if (!allowed) {
          console.warn(`⚠️ [Backend Socket Audit] joinOrderRoom unauthorized user: ${userId}`);
          socket.emit('joinOrderRoomAck', {
            orderId,
            success: false,
            reason: 'unauthorized',
            userId,
          });
          return;
        }

        const roomStr = toOrderRoomId(orderId);
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

        socket.join(roomStr);
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

        const roomStr = toOrderRoomId(orderId);
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

        // Ensure customer socket is in the room (TrackingPage may emit before joinOrderRoom)
        socket.join(roomStr);
        await logRoomMembers(io, roomStr, 'CUSTOMER ROOM MEMBERS (after customer join on send)');

        const customerPoint = { lat: numLat, lng: numLng };
        storeCustomerLocation(roomStr, numLat, numLng);

        // Invalidate any route cached against old DB destination
        lastTrustedRouteData.delete(roomStr);

        // ── 1. Broadcast live customer GPS to handyman (and others in room) ──
        await broadcastCustomerLocationUpdate(io, roomStr, numLat, numLng);

        const handymanPoint = lastHandymanLocations.get(roomStr) ?? null;
        console.log('[ROUTE INPUT] handyman =', handymanPoint ?? 'not yet received');
        console.log('[ROUTE INPUT] customer =', customerPoint, '(live-gps)');

        if (handymanPoint) {
          const directMeters = haversineMeters(handymanPoint, customerPoint);
          console.log('[ROUTE INPUT] directDistanceMeters =', Math.round(directMeters));

          const customerDest = { lat: numLat, lng: numLng, source: 'live-gps' };

          // ── Always deliver handyman coords BEFORE arrival check ──
          const baseUpdate = {
            lat: handymanPoint.lat,
            lng: handymanPoint.lng,
            ...buildCustomerFields(customerDest, handymanPoint),
          };
          await broadcastLocationUpdate(io, roomStr, baseUpdate);

          if (checkAndEmitArrival(io, roomStr, handymanPoint, customerPoint, 'sendCustomerLocation')) {
            return;
          }

          // ── 2. Optional route-enriched locationUpdate ──
          let routePayload = {};
          const now = Date.now();
          const lastCalc = getThrottle(orderId);
          const intervalSec = parseInt(process.env.ETA_RECALCULATION_INTERVAL_SEC) || 60;
          const throttleExpired = now - lastCalc > intervalSec * 1000;

          if (directMeters <= ARRIVAL_THRESHOLD_METERS) {
            console.log('[ROUTE] Skipping TomTom on sendCustomerLocation — within arrival threshold');
          } else if (throttleExpired) {
            console.log('[ROUTE] TomTom recalc triggered by sendCustomerLocation');
            setThrottle(orderId, now);
            try {
              const routeData = await calculateRoute(handymanPoint, customerDest);
              if (routeData?.distance != null) {
                const routeMeters = routeData.distance * 1000;
                if (!(directMeters < 500 && routeMeters > directMeters * 10 + 500)) {
                  const trusted = buildTrustedRouteEntry(routeData, handymanPoint, customerDest, now, 'live-gps');
                  lastTrustedRouteData.set(roomStr, trusted);
                  routePayload = withRouteGeometryAliases({
                    distanceRemaining: routeData.distance,
                    eta: routeData.eta,
                    trafficDelay: routeData.trafficDelay,
                    arrivalTime: routeData.arrivalTime,
                    etaTimestamp: now,
                    routeCalcTimestamp: now,
                  }, routeData.geometry);
                } else {
                  console.warn('[ROUTE] TomTom rejected on sendCustomerLocation — inconsistent with direct distance');
                }
              }
            } catch (err) {
              console.error('[ROUTE] TomTom error on sendCustomerLocation:', err.message);
            }
          }

          if (Object.keys(routePayload).length > 0) {
            const updateData = {
              lat: handymanPoint.lat,
              lng: handymanPoint.lng,
              ...buildCustomerFields(customerDest, handymanPoint),
              ...routePayload,
            };
            await broadcastLocationUpdate(io, roomStr, updateData);
            console.log('📍 [BACKEND] Sending route-enriched locationUpdate | orderId =', roomStr);
            console.log('  customerLat =', updateData.customerLat, '| customerLng =', updateData.customerLng);
            console.log('  distanceRemaining =', updateData.distanceRemaining ?? 'N/A');
            console.log('  geometry points =', Array.isArray(updateData.geometry) ? updateData.geometry.length : 0);
          }
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

        // Ensure handyman socket is in the order room
        socket.join(roomStr);
        await logRoomMembers(io, roomStr, 'HANDYMAN ROOM MEMBERS (after handyman join on send)');

        const origin = { lat: numLat, lng: numLng };
        lastHandymanLocations.set(roomStr, { ...origin, updatedAt: Date.now() });

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
        await broadcastLocationUpdate(io, roomStr, baseHandymanUpdate);

        if (customerDest && checkAndEmitArrival(io, roomStr, origin, customerDest, 'sendLocation')) {
          return;
        }

        // calc route and ETA using TomTom API (throttled, with cache validation)
        let routeData = null;
        if (customerDest) {
          const now = Date.now();
          const lastCalc = getThrottle(orderId);
          const intervalSec = parseInt(process.env.ETA_RECALCULATION_INTERVAL_SEC) || 60;
          const cached = lastTrustedRouteData.get(roomStr) ?? null;
          const cacheStillValid = cached && isRouteCacheValid(cached, origin, customerDest, customerDest.source);
          const throttleExpired = now - lastCalc > intervalSec * 1000;
          const shouldRecalculate = throttleExpired || !cacheStillValid;

          // Skip TomTom entirely when users are very close — arrival should have caught this,
          // but guard against routing to a far DB address while live GPS says otherwise.
          const directMeters = haversineMeters(origin, customerDest);
          if (directMeters <= ARRIVAL_THRESHOLD_METERS) {
            console.log('[ROUTE] Skipping TomTom — direct distance', Math.round(directMeters), 'm (within arrival threshold)');
            if (checkAndEmitArrival(io, roomStr, origin, customerDest, 'pre-tomtom-guard')) {
              return;
            }
          }
          // Coords already broadcast above; arrival may have fired and returned earlier.

          if (!shouldRecalculate) {
            const remainingSec = Math.ceil((intervalSec * 1000 - (now - lastCalc)) / 1000);
            console.log(`⏳ [ROUTE] TomTom throttled — reusing valid cache | remaining = ${remainingSec}s`);
          } else {
            if (!throttleExpired && !cacheStillValid) {
              console.log('[ROUTE] Forcing TomTom recalc — cached route no longer matches current coordinates');
            }
            console.log(`\n[ROUTE] TomTom request | origin=(${origin.lat}, ${origin.lng}) -> dest=(${customerDest.lat}, ${customerDest.lng}) [${customerDest.source}]`);

            setThrottle(orderId, now);

            try {
              routeData = await calculateRoute(origin, customerDest);

              if (routeData && routeData.distance !== null) {
                const routeMeters = routeData.distance * 1000;
                console.log('[ROUTE RESULT] origin =', origin);
                console.log('[ROUTE RESULT] destination =', customerDest);
                console.log('[ROUTE RESULT] routeDistanceMeters =', Math.round(routeMeters));
                console.log('[ROUTE RESULT] etaSeconds =', Math.round((routeData.eta ?? 0) * 60));
                console.log('[ROUTE RESULT] geometry points =', routeData.geometry?.length ?? 0);

                // Reject TomTom result if it wildly disagrees with direct distance (stale/wrong destination)
                if (directMeters < 500 && routeMeters > directMeters * 10 + 500) {
                  console.warn('[ROUTE RESULT] REJECTED — TomTom distance', routeData.distance, 'km inconsistent with direct', Math.round(directMeters), 'm');
                  routeData = null;
                  lastTrustedRouteData.delete(roomStr);
                } else {
                  if (order.eta !== null && order.eta !== undefined && Math.abs(routeData.eta - order.eta) <= 2) {
                    routeData.eta = order.eta;
                  }
                  const trusted = buildTrustedRouteEntry(routeData, origin, customerDest, now, customerDest.source);
                  lastTrustedRouteData.set(roomStr, trusted);
                  console.log('[ROUTE] Cache updated | routeCalcTimestamp =', new Date(now).toISOString());
                }
              } else {
                console.warn('[ROUTE] TomTom returned no valid route — will not attach stale cache');
                routeData = null;
                if (!cacheStillValid) {
                  lastTrustedRouteData.delete(roomStr);
                }
              }
            } catch (err) {
              console.error(`[ROUTE] TomTom error | order ${orderId}: ${err.message}`);
              routeData = null;
              if (!cacheStillValid) {
                lastTrustedRouteData.delete(roomStr);
              }
            }
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
          order.eta = routeData.eta;
          order.distanceRemaining = routeData.distance;
          order.trafficDelay = routeData.trafficDelay;
          order.arrivalTime = routeData.arrivalTime;
        }

        await order.save();

        // ── Build locationUpdate payload ──────────────────────────────────────────
        // Priority:
        //  1. Fresh TomTom result (routeData !== null)
        //  2. Last trusted cached result ONLY if still valid for current origin/dest
        //  3. Nothing — emit lat/lng only (never attach stale route data)
        const trusted = lastTrustedRouteData.get(roomStr) ?? null;
        const cacheValidForEmit = trusted && customerDest && isRouteCacheValid(trusted, origin, customerDest, customerDest.source);

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
        } else if (cacheValidForEmit) {
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

        const updateData = {
          lat: numLat,
          lng: numLng,
          ...(customerDest ? buildCustomerFields(customerDest, origin) : {}),
          ...routePayload,
        };

        // Route-enriched update (base lat/lng already broadcast above)
        if (Object.keys(routePayload).length > 0) {
          await broadcastLocationUpdate(io, roomStr, updateData);
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