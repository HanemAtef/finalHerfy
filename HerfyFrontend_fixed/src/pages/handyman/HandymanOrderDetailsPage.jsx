import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import {
  FaMapMarkerAlt,
  FaPhone,
  FaComments,
  FaCheck,
  FaTimes,
  FaCamera,
  FaFlag,
  FaBan,
} from "react-icons/fa";

import { fetchOrderById, updateOrderStatus, markOrderOnTheWay } from '../../store/slices/orderSlice';
import { uploadService, reportService } from '../../services/api';
import { connectSocket, getSocketInstanceId } from '../../socket/socket';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LocationLabel from '../../components/common/LocationLabel';
import ReasonModal from '../../components/common/ReasonModal';
import AlertMessage from '../../components/common/AlertMessage';
import TrackingMap from '../../components/Map/TrackingMap';
// NOTE: useCurrentLocation is intentionally NOT imported here.
// Live tracking must use ONLY navigator.geolocation.watchPosition
// inside the live tracking useEffect. Using the hook would risk
// seeding the map with a cached/Wi-Fi/login location before the
// first real GPS fix.
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';
import {
  isRouteConsistentWithPositions,
  isRouteGeometryValid,
  isValidGpsCoord,
  normalizeGpsLocation,
  parseOrderCustomerLocation,
} from '../../utils/routeValidation';
import { devLog } from '../../utils/devLog';

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
};
/** Stricter options for initial fix — prefer GPS chip over Wi-Fi */
const GPS_INIT_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 25000,
};

/** Valid live handyman GPS — never accept 0,0 or out-of-range values */
const isValidHandymanCoord = (lat, lng) => {
  const numLat = Number(lat);
  const numLng = Number(lng);
  return Number.isFinite(numLat) && Number.isFinite(numLng) && isValidGpsCoord(numLat, numLng);
};

const clearRouteState = (refs, setters) => {
  refs.lastTrustedEtaRef.current = null;
  refs.etaTimestampRef.current = null;
  setters.setRouteGeometry(null);
  setters.setDistance(null);
  setters.setLastTrustedEta(null);
  setters.setEtaTimestamp(null);
  setters.setDisplayedEta(null);
};


export default function HandymanOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentOrder, isLoading, error } = useSelector(
    (state) => state.orders
  );

  const { token, user } = useSelector((state) => state.auth);

  // ── LIVE GPS state — ONLY updated by navigator.geolocation.watchPosition ──
  // This is NEVER seeded from: login response, DB, currentOrder,
  // stored profile, localStorage, or any cached value.
  const [handymanLoc, setHandymanLoc] = useState(null);
  /** Live customer GPS only — used for map marker + route validation (never DB) */
  const [customerTrackingLoc, setCustomerTrackingLoc] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeCalcTimestamp, setRouteCalcTimestamp] = useState(null);
  const [routeDestination, setRouteDestination] = useState(null);
  const [distance, setDistance] = useState(null);
  const [lastTrustedEta, setLastTrustedEta] = useState(null);
  const [etaTimestamp, setEtaTimestamp] = useState(null);
  const [displayedEta, setDisplayedEta] = useState(null);
  const [handymanArrived, setHandymanArrived] = useState(false);
  const [price, setPrice] = useState("");
  const [completionImage, setCompletionImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  // initializing → waiting for getCurrentPosition | ready | denied | error
  const [gpsStatus, setGpsStatus] = useState('initializing');

  const lastTrustedEtaRef = useRef(null);
  const etaTimestampRef = useRef(null);
  const handymanLocRef = useRef(null);
  const customerLocRef = useRef(null);
  const initialGpsReadyRef = useRef(false);
  const isLiveRef = useRef(false);
  const socketRef = useRef(null);
  const lastSentRef = useRef(0);
  const pendingLocationRef = useRef(null);
  const flushTimeoutRef = useRef(null);
  const SEND_INTERVAL_MS = 5000;
  const isHandymanJoinedRef = useRef(false);
  const customerLocSourceRef = useRef(null); // 'live-gps' when customer socket received
  const orderCustomerMapLocRef = useRef(null);
  const routeDestinationRef = useRef(null);
  const pendingArrivalRef = useRef(false);
  const [arrivalPending, setArrivalPending] = useState(false);

  const currentOrderRef = useRef(currentOrder);
  useEffect(() => {
    currentOrderRef.current = currentOrder;
  }, [currentOrder]);

  const isTerminalOrder = useCallback((order) => {
    if (!order) return false;
    // 'arrived' is NOT terminal — the handyman is physically present but work
    // hasn't started yet. The socket must stay alive so the customer map
    // can continue showing the handyman's last position and the arrival banner.
    const terminalStatuses = ['completed', 'cancelled', 'disputed'];
    return (
      terminalStatuses.includes(order.status) ||
      order.trackingStatus === 'expired'
    );
  }, []);

  // Fetch order
  useEffect(() => {
    dispatch(fetchOrderById(id));
  }, [dispatch, id]);

  // Set price
  useEffect(() => {
    if (currentOrder?.estimatedPrice) {
      setPrice(String(currentOrder.estimatedPrice));
    }
  }, [currentOrder?.estimatedPrice]);

  // Order address for map marker; live GPS used for routing when available
  const orderCustomerMapLoc = useMemo(
    () => parseOrderCustomerLocation(currentOrder),
    [currentOrder?.customerLocation]
  );

  useEffect(() => {
    orderCustomerMapLocRef.current = orderCustomerMapLoc;
    if (orderCustomerMapLoc) {
      routeDestinationRef.current = routeDestinationRef.current ?? orderCustomerMapLoc;
      setRouteDestination((prev) => prev ?? orderCustomerMapLoc);
    }
  }, [orderCustomerMapLoc]);

  const mapCustomerLocation = orderCustomerMapLoc;

  // ===== GPS INIT: getCurrentPosition FIRST, then watchPosition =====
  const hasArrivedRef = useRef(false);
  const watchIdRef = useRef(null);
  const gpsInitGenRef = useRef(0);
  const tryFinalizeArrivalRef = useRef(() => { });

  const tryFinalizeArrival = useCallback(() => {
    if (!pendingArrivalRef.current || hasArrivedRef.current) return;

    const handyman = handymanLocRef.current;
    const customer =
      orderCustomerMapLocRef.current ??
      customerLocRef.current;
    if (!handyman || !customer) return;
    if (!isValidHandymanCoord(handyman.latitude, handyman.longitude)) return;
    if (!isValidGpsCoord(customer.latitude, customer.longitude)) return;

    pendingArrivalRef.current = false;
    hasArrivedRef.current = true;
    lastTrustedEtaRef.current = null;
    etaTimestampRef.current = null;
    setArrivalPending(false);
    setHandymanArrived(true);
    setRouteGeometry(null);
    setDistance(0);
    setLastTrustedEta(null);
    setEtaTimestamp(null);
    setDisplayedEta(0);
    devLog('✅ HANDYMAN ARRIVED | finalized after live GPS ready', {
      handyman,
      customer,
    });

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    tryFinalizeArrivalRef.current = tryFinalizeArrival;
  }, [tryFinalizeArrival]);

  const clearFlushTimeout = () => {
    if (flushTimeoutRef.current != null) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
  };

  const emitSendLocation = (socket, lat, lng) => {
    if (!socket?.connected) return false;

    if (!isHandymanJoinedRef.current) {
      console.log('[HANDYMAN SOCKET BLOCKED] sendLocation — handyman not joined to order room');
      return false;
    }

    if (currentOrderRef.current?._id && String(id) !== String(currentOrderRef.current._id)) {
      console.log('[HANDYMAN SOCKET BLOCKED] sendLocation — orderId mismatch');
      return false;
    }

    console.log('[HANDYMAN SOCKET AUDIT] SEND_LOCATION PRE-CHECK', {
      socketId: socket.id,
      orderId: id,
      isHandymanJoined: isHandymanJoinedRef.current,
      connected: socket.connected,
      isLive: isLiveRef.current,
      initialGpsReady: initialGpsReadyRef.current,
    });

    console.log('[HANDYMAN SOCKET AUDIT] SEND_LOCATION EMIT', {
      socketId: socket.id,
      orderId: id,
      lat,
      lng,
    });
    socket.emit('sendLocation', { orderId: id, lat, lng });
    lastSentRef.current = Date.now();
    pendingLocationRef.current = null;
    console.log('[HANDYMAN SOCKET AUDIT] LOCATION SENT', {
      socketId: socket.id,
      orderId: id,
      lat,
      lng,
    });
    return true;
  };

  const schedulePendingFlush = (delayMs) => {
    if (flushTimeoutRef.current != null) return;
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null;
      const socket = socketRef.current;
      const pending = pendingLocationRef.current;
      if (!pending || !socket?.connected) return;
      if (!initialGpsReadyRef.current) return;
      if (!isValidHandymanCoord(pending.lat, pending.lng)) return;
      if (hasArrivedRef.current || !isLiveRef.current) return;

      console.log('[HANDYMAN SOCKET AUDIT] FLUSH PENDING LOCATION', {
        orderId: id,
        lat: pending.lat,
        lng: pending.lng,
        socketId: socket.id,
      });
      emitSendLocation(socket, pending.lat, pending.lng);
    }, Math.max(0, delayMs));
  };

  const flushPendingLocation = (socket, { immediate = false } = {}) => {
    const pending = pendingLocationRef.current;
    if (!pending || !socket?.connected) return;

    const { lat, lng } = pending;

    if (!initialGpsReadyRef.current) return;
    if (!isValidHandymanCoord(lat, lng)) return;
    if (hasArrivedRef.current || !isLiveRef.current) return;

    console.log('[HANDYMAN SOCKET AUDIT] FLUSH PENDING LOCATION', {
      orderId: id,
      lat,
      lng,
      socketId: socket.id,
    });

    if (!immediate) {
      const msSinceLastSend = Date.now() - lastSentRef.current;
      if (lastSentRef.current > 0 && msSinceLastSend < SEND_INTERVAL_MS) {
        schedulePendingFlush(SEND_INTERVAL_MS - msSinceLastSend);
        return;
      }
    }

    emitSendLocation(socket, lat, lng);
  };

  const queueOrSendLocation = (socket, lat, lng) => {
    const logReturn = (reason) => {
      console.log('[HANDYMAN SOCKET AUDIT] QUEUE/SEND RETURN', {
        reason,
        orderId: id,
        socketId: socket?.id ?? null,
        connected: !!socket?.connected,
        isLive: isLiveRef.current,
        initialGpsReady: initialGpsReadyRef.current,
        hasArrived: hasArrivedRef.current,
      });
    };

    console.log('[HANDYMAN SOCKET AUDIT] QUEUE/SEND', {
      orderId: id,
      lat,
      lng,
      socketId: socket?.id ?? null,
      connected: !!socket?.connected,
      isLive: isLiveRef.current,
      initialGpsReady: initialGpsReadyRef.current,
      hasArrived: hasArrivedRef.current,
      sameAsStoredRef: socket != null && socket === socketRef.current,
      socketInstanceId: getSocketInstanceId(),
    });

    if (!initialGpsReadyRef.current) {
      devLog('🚫 [TRACKING BLOCKED] Current GPS location not ready');
      logReturn('initial_gps_not_ready');
      return;
    }
    if (!isValidHandymanCoord(lat, lng)) {
      console.error('❌ [GPS ERROR] Invalid coordinates — not sending', { lat, lng });
      logReturn('invalid_coordinates');
      return;
    }
    if (!isHandymanJoinedRef.current) {
      logReturn('handyman_not_joined');
      return;
    }
    if (currentOrderRef.current?._id && String(id) !== String(currentOrderRef.current._id)) {
      logReturn('order_id_mismatch');
      return;
    }
    if (hasArrivedRef.current || !isLiveRef.current) {
      logReturn(hasArrivedRef.current ? 'already_arrived' : 'is_live_false');
      return;
    }

    const payload = { orderId: id, lat, lng };

    if (!socket?.connected) {
      pendingLocationRef.current = payload;
      devLog('📦 [SOCKET QUEUE] Location queued — socket disconnected', payload);
      logReturn('socket_not_connected');
      return;
    }

    const now = Date.now();
    const msSinceLastSend = lastSentRef.current > 0 ? now - lastSentRef.current : SEND_INTERVAL_MS;
    const willThrottle = lastSentRef.current > 0 && msSinceLastSend < SEND_INTERVAL_MS;

    console.log('[HANDYMAN SOCKET AUDIT] THROTTLE CHECK', {
      lastSentAt: lastSentRef.current,
      now,
      msSinceLastSend,
      sendInterval: SEND_INTERVAL_MS,
      willThrottle,
    });

    if (willThrottle) {
      pendingLocationRef.current = payload;
      const msUntilSend = SEND_INTERVAL_MS - msSinceLastSend;
      console.log('[HANDYMAN SOCKET AUDIT] LOCATION QUEUED', {
        orderId: id,
        lat,
        lng,
        msUntilSend,
      });
      schedulePendingFlush(msUntilSend);
      logReturn('throttled');
      return;
    }

    console.log('[HANDYMAN SOCKET AUDIT] PASSED SEND GATE', {
      orderId: id,
      socketId: socket?.id ?? null,
      lat,
      lng,
    });

    emitSendLocation(socket, lat, lng);
  };

  const startWatchAfterInitialFix = (lat, lng) => {
    // Never start a new watcher after arrival or terminal status
    if (isTerminalOrder(currentOrderRef.current) || hasArrivedRef.current) {
      console.log('[GPS] startWatchAfterInitialFix skipped — order is terminal or arrived');
      return;
    }
    if (watchIdRef.current !== null) return;
    console.log('[HANDYMAN SOCKET AUDIT] GPS WATCH STARTED', { orderId: id });
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (currentOrderRef.current?._id && String(id) !== String(currentOrderRef.current._id)) {
          console.log('[GPS] Watcher callback killed — orderId mismatch (stale closure)');
          navigator.geolocation.clearWatch(watchId);
          if (watchIdRef.current === watchId) watchIdRef.current = null;
          return;
        }

        if (isTerminalOrder(currentOrderRef.current)) {
          if (watchIdRef.current !== null) {
            console.log('[GPS] watchPosition callback killed active watcher — order is terminal');
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          return;
        }

        const wLat = position.coords.latitude;
        const wLng = position.coords.longitude;
        if (!isValidHandymanCoord(wLat, wLng)) return;
        console.log('📍 [GPS UPDATE] latitude =', wLat, '| longitude =', wLng);
        const wLoc = { latitude: wLat, longitude: wLng };
        handymanLocRef.current = wLoc;
        setHandymanLoc(wLoc);
        // Keep sending until arrival is finalized (not just pending)
        if (!hasArrivedRef.current && isLiveRef.current) {
          queueOrSendLocation(socketRef.current, wLat, wLng);
        }
      },
      (err) => {
        if (isTerminalOrder(currentOrderRef.current)) {
          if (watchIdRef.current !== null) {
            console.log('[GPS] watchPosition error callback killed active watcher — order is terminal');
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          return;
        }

        console.error('❌ [GPS ERROR] watchPosition |', err.message);
        if (err.code === 1) {
          setGpsPermissionDenied(true);
          setGpsStatus('denied');
        }
      },
      GPS_OPTIONS
    );
    watchIdRef.current = watchId;
    queueOrSendLocation(socketRef.current, lat, lng);
  };

  const isHandymanGpsInitAllowed = useCallback((order) => {
    if (!order) return false;
    if (order._id != null && String(order._id) !== String(id)) return false;
    if (order.trackingStatus === 'expired') return false;
    // GPS init is allowed for all active work states (not just price_confirmed/in-progress)
    if (['completed', 'cancelled', 'disputed'].includes(order.status)) return false;

    return ['price_confirmed', 'in-progress', 'arrived'].includes(order.status);
  }, [id]);

  // isTrackingLive: routing, map, and GPS are ACTIVE.
  // Excludes 'arrived' & 'in-progress' — once handyman reaches customer/starts work,
  // the map and GPS sending must remain stopped.
  const isTrackingLive = useMemo(() => {
    if (!currentOrder) return false;
    if (currentOrder.trackingStatus === 'expired') return false;
    if (['arrived', 'in-progress', 'completed', 'cancelled', 'disputed'].includes(currentOrder.status)) return false;

    return (
      currentOrder.status === 'price_confirmed' && currentOrder.isHandymanOnTheWay === true
    );
  }, [currentOrder]);

  // socketShouldBeAlive: keep the Socket.IO room joined so both sides
  // receive the arrival event / banner synchronisation. This is a superset
  // of isTrackingLive — it additionally covers the 'arrived' window
  // between physical arrival and the handyman pressing Start Work.
  const socketShouldBeAlive = useMemo(() => {
    if (!currentOrder) return false;
    if (['completed', 'cancelled', 'disputed'].includes(currentOrder.status)) return false;
    if (currentOrder.trackingStatus === 'expired') return false;

    return (
      isTrackingLive ||
      currentOrder.status === 'arrived'
    );
  }, [currentOrder, isTrackingLive]);


  useEffect(() => {
    isLiveRef.current = isTrackingLive;

    if (isTrackingLive) {
      const socket = socketRef.current;
      devLog('[HANDYMAN SOCKET AUDIT] TRACKING STATE', {
        orderId: id,
        status: currentOrder?.status ?? null,
        isHandymanOnTheWay: currentOrder?.isHandymanOnTheWay ?? null,
        isLive: isTrackingLive,
        socketConnected: !!socket?.connected,
        socketId: socket?.id ?? null,
        currentOrderId: currentOrder?._id ?? null,
        orderIdMatches: currentOrder?._id != null && String(currentOrder._id) === String(id),
        isHandymanJoined: isHandymanJoinedRef.current,
      });
    }
  }, [currentOrder, id, isTrackingLive]);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error('❌ [GPS ERROR] Geolocation not supported');
      setGpsStatus('error');
      return;
    }

    if (!isHandymanGpsInitAllowed(currentOrder)) {
      return;
    }

    if (watchIdRef.current !== null) return;

    console.log('📍 [GPS INIT] Requesting initial handyman location...');
    const gen = ++gpsInitGenRef.current;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const isAllowed = isHandymanGpsInitAllowed(currentOrderRef.current);
        console.log('[GPS TRACE] getCurrentPosition success', {
          isAllowed,
          status: currentOrderRef.current?.status,
          trackingStatus: currentOrderRef.current?.trackingStatus,
          isHandymanOnTheWay: currentOrderRef.current?.isHandymanOnTheWay,
        });

        if (!isAllowed) {
          console.log('[GPS TRACE] Aborted callback — order not eligible for GPS init');
          return;
        }

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        console.log('📍 [GPS INIT] Location received');
        console.log('📍 [GPS INIT] latitude =', lat);
        console.log('📍 [GPS INIT] longitude =', lng);
        console.log('📍 [GPS INIT] accuracy =', pos.coords.accuracy, 'm');

        if (!isValidHandymanCoord(lat, lng)) {
          console.error('❌ [GPS ERROR] Invalid coordinates');
          setGpsStatus('error');
          return;
        }

        if (pos.coords.accuracy > 115) {
          console.warn('⚠️ [GPS INIT] Low accuracy =', pos.coords.accuracy, 'm — enableHighAccuracy active; mobile GPS improves outdoors');
        }

        console.log('[GPS TRACE] setting handymanLoc & gpsStatus ready', { lat, lng });
        const loc = { latitude: lat, longitude: lng };
        handymanLocRef.current = loc;
        setHandymanLoc(loc);
        initialGpsReadyRef.current = true;
        setGpsStatus('ready');

        // Only start continuous watchPosition if tracking is already live
        if (isLiveRef.current) {
          console.log('[GPS TRACE] starting watchPosition (tracking is live)');
          startWatchAfterInitialFix(lat, lng);
        } else {
          console.log('[GPS TRACE] initial GPS fix complete — waiting for "أنا قادم" click');
        }
      },
      (err) => {
        if (!isHandymanGpsInitAllowed(currentOrderRef.current)) return;
        console.error('❌ [GPS INIT] Location error');
        console.error('❌ [GPS INIT] code =', err.code);
        console.error('❌ [GPS INIT] message =', err.message);
        if (err.code === 1) {
          console.error('❌ [GPS INIT] Location permission denied');
          setGpsPermissionDenied(true);
          setGpsStatus('denied');
        } else if (err.code === 2) {
          console.error('❌ [GPS INIT] Position unavailable');
          setGpsStatus('error');
        } else {
          setGpsStatus('error');
        }
      },
      GPS_INIT_OPTIONS
    );

    return () => {
      gpsInitGenRef.current += 1;
      clearFlushTimeout();
      if (watchIdRef.current !== null) {
        console.log(`[GPS] Unconditionally clearing watchId ${watchIdRef.current} on unmount / orderId change (${id})`);
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [currentOrder?.status, currentOrder?.trackingStatus, id, isHandymanGpsInitAllowed, isTerminalOrder]);

  // ── Kill GPS watcher when order reaches any terminal/stopped state ──────────
  useEffect(() => {
    if (!currentOrder) return;
    if (isTerminalOrder(currentOrder)) {
      // Invalidate any pending initial fix callbacks
      gpsInitGenRef.current += 1;
      clearFlushTimeout();

      if (watchIdRef.current !== null) {
        console.log(
          `[GPS] watchPosition cleared — status=${currentOrder.status} trackingStatus=${currentOrder.trackingStatus}`
        );
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
  }, [currentOrder?.status, currentOrder?.trackingStatus, isTerminalOrder]);

  // Clear throttle flush timer on unmount / order change
  useEffect(() => () => clearFlushTimeout(), [id]);

  const handymanTrackingSocketKey =
    id &&
      token &&
      socketShouldBeAlive
      ? `${id}:tracking`
      : null;

  // ===== Socket listeners — join room when THIS order is loaded and trackable =====
  useEffect(() => {
    if (!handymanTrackingSocketKey) {
      return;
    }

    devLog('🔌 [SOCKET] Registering tracking listeners for order', id);

    const socket = connectSocket(token);
    socketRef.current = socket;

    console.log('[HANDYMAN SOCKET AUDIT] SOCKET CREATED', {
      socketId: socket.id ?? null,
      connected: socket.connected,
    });

    console.log('[HANDYMAN SOCKET AUDIT] SOCKET IDENTITY', {
      socketId: socket.id ?? null,
      socketConnected: socket.connected,
      sameAsStoredRef: socket === socketRef.current,
      socketInstanceId: getSocketInstanceId(),
    });

    const applyCustomerLoc = (lat, lng, source = 'live-gps') => {
      const numLat = Number(lat);
      const numLng = Number(lng);
      if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || !isValidGpsCoord(numLat, numLng)) return;
      const loc = { latitude: numLat, longitude: numLng };
      customerLocSourceRef.current = source;
      customerLocRef.current = loc;
      setCustomerTrackingLoc(loc);
      devLog('[HANDYMAN] ✅ customer location updated =', loc, '| source =', source);
    };

    const onCustomerLocationUpdate = (data) => {
      console.log('[SOCKET AUDIT][HANDYMAN CUSTOMER LOCATION RECEIVED]', {
        socketId: socket.id,
        orderId: id,
        payload: data,
      });
      console.log('📡 [HANDYMAN] customerLocationUpdate RECEIVED', data);
      const lat = data?.lat ?? data?.latitude;
      const lng = data?.lng ?? data?.longitude;
      console.log('📍 [HANDYMAN] customer GPS =', { latitude: lat, longitude: lng });
      applyCustomerLoc(lat, lng, data?.source || 'live-gps');
    };

    const onLocationUpdate = (payload) => {
      devLog('[HANDYMAN] locationUpdate received', payload);

      if (hasArrivedRef.current) return;

      // ── 1. Live customer GPS from payload (live-gps only for display) ──
      if (
        payload?.destinationSource === 'live-gps' &&
        Number.isFinite(payload?.customerLat) &&
        Number.isFinite(payload?.customerLng)
      ) {
        applyCustomerLoc(payload.customerLat, payload.customerLng, 'live-gps');
      }

      const liveHandyman = handymanLocRef.current;
      const payloadDest = normalizeGpsLocation(payload?.customerLat, payload?.customerLng);
      if (payloadDest) {
        routeDestinationRef.current = payloadDest;
        setRouteDestination(payloadDest);
      }

      // Authoritative routing destination is ALWAYS the fixed order.customerLocation
      const fixedOrderDest =
        orderCustomerMapLocRef.current ??
        payloadDest ??
        routeDestinationRef.current;

      const routeKm = payload?.distanceRemaining;

      if (!liveHandyman || !fixedOrderDest) {
        devLog('[HANDYMAN] Skipping route/distance — waiting for handyman + customer destination');
        return;
      }

      let routeIsStale = false;
      let staleReason = null;

      if (
        payload?.directDistanceMeters != null &&
        payload.directDistanceMeters <= 50 &&
        routeKm != null &&
        routeKm > 0.5
      ) {
        staleReason = `direct = ${payload.directDistanceMeters}m but route = ${routeKm}km`;
        routeIsStale = true;
      }

      if (fixedOrderDest && !isRouteConsistentWithPositions(routeKm, liveHandyman, fixedOrderDest)) {
        staleReason = `route ${routeKm}km inconsistent with handyman/destination positions`;
        routeIsStale = true;
      }

      const incomingGeometry = payload?.geometry ?? payload?.routeGeometry;

      console.log('[HANDYMAN ROUTE AUDIT]', {
        orderId: id,
        handymanGps: liveHandyman,
        fixedOrderDestination: fixedOrderDest,
        destinationSource: payload?.destinationSource || 'order-db',
        routePointsCount: Array.isArray(incomingGeometry) ? incomingGeometry.length : 0,
        routeCalcTimestamp: payload?.routeCalcTimestamp,
        routeKm,
        routeIsStale,
        staleReason,
      });

      if (routeIsStale) {
        console.warn('[HANDYMAN] Stale route rejected | reason =', staleReason);
        clearRouteState(
          { lastTrustedEtaRef, etaTimestampRef },
          { setRouteGeometry, setDistance, setLastTrustedEta, setEtaTimestamp, setDisplayedEta }
        );
        setRouteGeometry(null);
        setRouteCalcTimestamp(null);
        return;
      }

      // ── 3. Apply valid route geometry + distance + ETA ──
      if (payload?.routeCalcTimestamp) setRouteCalcTimestamp(payload.routeCalcTimestamp);

      const geometryIsValid =
        Array.isArray(incomingGeometry) &&
        incomingGeometry.length >= 2 &&
        isRouteGeometryValid(incomingGeometry, liveHandyman, fixedOrderDest) &&
        isRouteConsistentWithPositions(routeKm, liveHandyman, fixedOrderDest);

      if (geometryIsValid) {
        devLog('[HANDYMAN] ✅ route geometry received | points =', incomingGeometry.length);
        setRouteGeometry(incomingGeometry);
      } else if (Array.isArray(incomingGeometry) && incomingGeometry.length >= 2) {
        console.warn('[HANDYMAN] Stale geometry rejected — clearing routeGeometry', {
          points: incomingGeometry.length,
          handyman: liveHandyman,
          destination: fixedOrderDest,
        });
        setRouteGeometry(null);
        setRouteCalcTimestamp(null);
      }

      if (payload?.distanceRemaining !== undefined && payload?.distanceRemaining !== null) {
        setDistance(payload.distanceRemaining);
      }

      if (payload?.eta !== undefined && payload?.eta !== null) {
        const now = payload.etaTimestamp || Date.now();
        lastTrustedEtaRef.current = payload.eta;
        etaTimestampRef.current = now;
        setLastTrustedEta(payload.eta);
        setEtaTimestamp(now);
        setDisplayedEta(payload.eta);
      }
    };

    const onHandymanArrived = (payload) => {
      console.log('✅ HANDYMAN ARRIVED | received from backend', payload);
      if (hasArrivedRef.current) return;
      // Defer UI until handyman + customer markers are available for the map
      pendingArrivalRef.current = true;
      setArrivalPending(true);
      devLog('[HANDYMAN] Arrival pending — waiting for GPS markers before UI lock');
      tryFinalizeArrivalRef.current();
    };

    const onJoinOrderRoomAck = (ack) => {
      console.log('[HANDYMAN SOCKET AUDIT] JOIN ACK', {
        success: ack?.success ?? false,
        reason: ack?.reason ?? null,
        orderId: ack?.orderId ?? id,
        socketId: socket.id,
        role: ack?.role ?? null,
        roomStr: ack?.roomStr ?? null,
      });
      if (ack?.success) {
        isHandymanJoinedRef.current = true;
        // Push handyman GPS after join so customer in room receives locationUpdate
        if (isLiveRef.current && initialGpsReadyRef.current) {
          flushPendingLocation(socket, { immediate: true });
          const loc = handymanLocRef.current;
          if (loc) {
            queueOrSendLocation(socket, loc.latitude, loc.longitude);
          }
        }
      } else {
        isHandymanJoinedRef.current = false;
        console.error('[HANDYMAN SOCKET AUDIT] JOIN FAILED', {
          reason: ack?.reason ?? 'unknown',
          orderId: ack?.orderId ?? id,
          socketId: socket.id,
          userId: user?._id ?? null,
        });
      }
    };

    const emitJoin = () => {
      console.log('[HANDYMAN SOCKET AUDIT] JOIN ATTEMPT', {
        socketId: socket.id ?? null,
        orderId: id,
        connected: socket.connected,
        socketInstanceId: getSocketInstanceId(),
        sameAsStoredRef: socket === socketRef.current,
      });
      console.log('[HANDYMAN SOCKET AUDIT] JOIN EMITTED', {
        socketId: socket.id ?? null,
        orderId: id,
      });
      isHandymanJoinedRef.current = false;
      socket.emit('joinOrderRoom', id);
    };

    const onConnect = () => {
      isHandymanJoinedRef.current = false;
      devLog('✅ SOCKET CONNECTED', socket.id);
      emitJoin();
      if (pendingLocationRef.current) {
        flushPendingLocation(socket, { immediate: true });
      }
    };

    const onDisconnect = (reason) => {
      devLog('🔴 Socket Disconnected:', reason);
      isHandymanJoinedRef.current = false;
    };

    // Listeners FIRST (customer → handyman route → arrival), then join room
    socket.off('customerLocationUpdate', onCustomerLocationUpdate);
    console.log('[HANDYMAN SOCKET AUDIT] LISTENER REGISTERED', {
      socketId: socket.id ?? null,
      event: 'customerLocationUpdate',
      socketInstanceId: getSocketInstanceId(),
    });
    socket.on('customerLocationUpdate', onCustomerLocationUpdate);
    socket.off('locationUpdate', onLocationUpdate);
    socket.on('locationUpdate', onLocationUpdate);
    socket.off('handymanArrived', onHandymanArrived);
    socket.on('handymanArrived', onHandymanArrived);
    socket.off('joinOrderRoomAck', onJoinOrderRoomAck);
    socket.on('joinOrderRoomAck', onJoinOrderRoomAck);
    socket.off('connect', onConnect);
    socket.on('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      emitJoin();
    }

    return () => {
      console.log('[HANDYMAN SOCKET AUDIT] SOCKET EFFECT CLEANUP', {
        orderId: id,
        socketId: socket.id ?? null,
      });
      clearFlushTimeout();
      isHandymanJoinedRef.current = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('customerLocationUpdate', onCustomerLocationUpdate);
      socket.off('locationUpdate', onLocationUpdate);
      socket.off('handymanArrived', onHandymanArrived);
      socket.off('joinOrderRoomAck', onJoinOrderRoomAck);
      console.log('[HANDYMAN SOCKET AUDIT] LEAVE EMITTED', {
        socketId: socket.id ?? null,
        orderId: id,
      });
      socket.emit('leaveOrderRoom', id);
    };
  }, [
    id,
    token,
    handymanTrackingSocketKey,
  ]);

  // Send location + flush queue when GPS becomes ready (avoid re-registering socket listeners)
  useEffect(() => {
    if (gpsStatus !== 'ready' || !initialGpsReadyRef.current || !isLiveRef.current) return;
    const socket = socketRef.current;
    if (!socket?.connected || hasArrivedRef.current) return;
    flushPendingLocation(socket);
    const loc = handymanLocRef.current;
    if (loc) {
      queueOrSendLocation(socket, loc.latitude, loc.longitude);
    }
  }, [gpsStatus, handymanLoc]);

  // Map is visible only while actively routing (not when arrived or terminal).
  // arrivalPending / handymanArrived are internal state flags that can linger
  // after the status has changed — gate purely on isTrackingLive instead.
  const showTrackingMap = isTrackingLive;

  const hasValidHandymanMapLoc =
    handymanLoc &&
    isValidHandymanCoord(handymanLoc.latitude, handymanLoc.longitude);

  const hasValidCustomerMapLoc =
    mapCustomerLocation &&
    isValidGpsCoord(mapCustomerLocation.latitude, mapCustomerLocation.longitude);

  const hasMapLocation = !!(hasValidHandymanMapLoc || hasValidCustomerMapLoc);

  const showMapSpinner =
    !hasMapLocation &&
    (gpsStatus === 'initializing' || (arrivalPending && !handymanArrived));

  // Finalize arrival when pending and both live GPS refs are available
  useEffect(() => {
    tryFinalizeArrival();
  }, [
    tryFinalizeArrival,
    arrivalPending,
    handymanLoc?.latitude,
    handymanLoc?.longitude,
    orderCustomerMapLoc?.latitude,
    orderCustomerMapLoc?.longitude,
  ]);

  const routeDestForValidation =
    routeDestination ?? mapCustomerLocation;

  const routeGeometryValid =
    !!routeGeometry &&
    !!handymanLoc &&
    !!routeDestForValidation &&
    isRouteGeometryValid(routeGeometry, handymanLoc, routeDestForValidation);

  const routeLoading =
    isTrackingLive &&
    !handymanArrived &&
    !arrivalPending &&
    gpsStatus === 'ready' &&
    !!handymanLoc &&
    !!routeDestForValidation &&
    !routeGeometryValid;

  // ── Local ETA countdown (timestamp-based) ──────────────────────────────────
  useEffect(() => {
    if (lastTrustedEta === null || etaTimestamp === null || handymanArrived) return;

    const tick = () => {
      const elapsedMin = (Date.now() - etaTimestamp) / 60000;
      const current = Math.max(0, lastTrustedEta - elapsedMin);
      setDisplayedEta(current);
    };

    tick(); // run immediately
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [lastTrustedEta, etaTimestamp, handymanArrived]);


  // Update order status
  const handleStatus = (status, extra = {}) => {
    dispatch(updateOrderStatus({ id, status, ...extra })).then((result) => {
      if (
        status === "accepted" &&
        updateOrderStatus.fulfilled.match(result)
      ) {
        navigate("/handyman/dashboard");
      }
    });
  };

  // Accept order
  const handleAccept = () => {
    const numericPrice = Number(price);

    if (!numericPrice || numericPrice <= 0) return;

    handleStatus("accepted", {
      price: numericPrice,
    });
  };

  // Upload completion image
  const handleCompletionImageChange = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(true);

    try {
      const res = await uploadService.uploadImage(file);
      setCompletionImage(res.data.url);
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  // Complete order
  const handleComplete = () => {
    if (!completionImage) return;

    handleStatus("completed", {
      completionImage,
    });
  };

  // On the way — blocked until valid initial GPS fix
  const handleOnTheWay = () => {
    if (!initialGpsReadyRef.current || gpsStatus !== 'ready' || !handymanLocRef.current) {
      console.log('🚫 [TRACKING BLOCKED] Current GPS location not ready — cannot start tracking');
      return;
    }
    if (!isValidHandymanCoord(handymanLocRef.current.latitude, handymanLocRef.current.longitude)) {
      console.error('❌ [GPS ERROR] Invalid coordinates — cannot start tracking');
      return;
    }
    const { latitude, longitude } = handymanLocRef.current;
    console.log('🚀 [TRACKING] Handyman confirmed on the way with GPS =', handymanLocRef.current);

    // Start continuous watchPosition now. isLiveRef will become true once
    // markOrderOnTheWay resolves and the Redux order update propagates, at
    // which point queueOrSendLocation inside watchPosition callbacks will
    // start emitting.
    if (watchIdRef.current === null) {
      console.log('[GPS TRACE] starting watchPosition from handleOnTheWay');
      startWatchAfterInitialFix(latitude, longitude);
    }

    dispatch(markOrderOnTheWay(id));
  };

  const retryGpsInit = () => {
    // Never restart GPS after arrival or when already in a terminal state
    if (isTerminalOrder(currentOrderRef.current) || hasArrivedRef.current) {
      console.log('[GPS] retryGpsInit skipped — order is terminal or arrived');
      return;
    }
    initialGpsReadyRef.current = false;
    setGpsStatus('initializing');
    setGpsPermissionDenied(false);
    console.log('📍 [GPS INIT] Retrying initial location request...');
    const gen = ++gpsInitGenRef.current;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gen !== gpsInitGenRef.current || isTerminalOrder(currentOrderRef.current)) {
          console.log('📍 [GPS INIT] Retry callback aborted — order terminal or gen stale');
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        console.log('📍 [GPS INIT] Location received (retry)');
        if (!isValidHandymanCoord(lat, lng)) {
          console.error('❌ [GPS ERROR] Invalid coordinates');
          setGpsStatus('error');
          return;
        }
        const loc = { latitude: lat, longitude: lng };
        handymanLocRef.current = loc;
        setHandymanLoc(loc);
        initialGpsReadyRef.current = true;
        setGpsStatus('ready');
        console.log('✅ [GPS INIT] Valid initial location (retry)');
        startWatchAfterInitialFix(lat, lng);
      },
      (err) => {
        if (gen !== gpsInitGenRef.current || isTerminalOrder(currentOrderRef.current)) return;
        if (err.code === 1) {
          console.error('❌ [GPS ERROR] Location permission denied');
          setGpsPermissionDenied(true);
          setGpsStatus('denied');
        } else {
          console.error('❌ [GPS ERROR]', err.message);
          setGpsStatus('error');
        }
      },
      GPS_INIT_OPTIONS
    );
  };

  // Report
  const handleReport = async (reason) => {
    try {
      await reportService.fileReport(id, {
        reason,
      });

      setReportSent(true);
      setReportOpen(false);

      dispatch(fetchOrderById(id));
    } catch (err) {
      console.error("Report failed:", err);
    }
  };

  // Loading
  if (isLoading && !currentOrder) {
    return <LoadingSpinner />;
  }

  // No order
  if (!currentOrder) {
    return (
      <div className="p-6 text-center">
        <p className="mb-4 text-textGray">
          تعذر تحميل تفاصيل الطلب
        </p>

        {error && (
          <p className="mb-4 text-emergency">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn-outline"
        >
          رجوع
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">

      {/* Back */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex h-10 items-center justify-center rounded-full bg-white px-5 text-primary shadow-sm transition-all hover:bg-neutral"
      >
        رجوع
      </button>

      <h1 className="mb-6 text-2xl font-bold text-textDark">
        تفاصيل الطلب
      </h1>

      {error && (
        <AlertMessage
          type="error"
          message={error}
          className="mb-4"
        />
      )}

      {/* Cancelled */}
      {currentOrder.status === "cancelled" && (
        <div className="card mb-4 flex items-center gap-3 border-r-4 border-emergency bg-emergency/5">
          <FaBan
            className="shrink-0 text-emergency"
            size={20}
          />

          <p className="text-sm text-textDark">
            تم إلغاء هذا الطلب. المحادثة مغلقة الآن.
          </p>
        </div>
      )}

      {/* Disputed */}
      {currentOrder.status === "disputed" && (
        <div className="card mb-4 flex items-center gap-3 border-r-4 border-secondary bg-secondary/5">
          <FaFlag
            className="shrink-0 text-secondary"
            size={20}
          />

          <p className="text-sm text-textDark">
            هذا الطلب قيد مراجعة بلاغ من فريق الدعم.
            المحادثة مغلقة مؤقتاً.
          </p>
        </div>
      )}

      {/* Order Information */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-neutral bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all hover:shadow-lg">

        <div className="mb-5 flex items-center justify-between border-b border-gray-50 pb-4">
          <span className="rounded-xl bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
            #{String(id).slice(-5)}
          </span>

          <span className="rounded-xl bg-secondary/10 px-3 py-1.5 text-sm font-semibold text-secondary">
            {ORDER_STATUS_LABELS[currentOrder.status] || currentOrder.status || 'غير محدد'}
          </span>
        </div>

        <h2 className="mb-2 text-lg font-bold text-textDark">
          {currentOrder.profession}
        </h2>

        <p className="mb-4 text-sm text-textGray">
          {currentOrder.description || "لا يوجد وصف"}
        </p>

        {currentOrder.images?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {currentOrder.images.map((img) => (
              <img
                key={img}
                src={img}
                alt=""
                className="h-16 w-16 rounded-lg object-cover"
              />
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-borderGray pt-4 text-sm">

          <div className="flex justify-between">
            <span className="text-textGray">
              العميل
            </span>

            <span className="font-medium">
              {currentOrder.customerId?.name}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-textGray">
              التاريخ
            </span>

            <span>
              {formatDate(currentOrder.createdAt)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-textGray">
              نوع الطلب
            </span>

            <span>
              {currentOrder.requestType === "scheduled"
                ? "مجدول"
                : "فوري"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-textGray">
              السعر المقدر من العميل
            </span>

            <span className="font-bold text-secondary">
              {formatPrice(currentOrder.estimatedPrice)}
            </span>
          </div>

          {currentOrder.price != null && (
            <div className="flex justify-between">
              <span className="text-textGray">
                السعر الذي حددته
              </span>

              <span className="font-bold text-secondary">
                {formatPrice(currentOrder.price)}
              </span>
            </div>
          )}

        </div>
      </div>

      {/* Location */}
      <div className="mb-6 rounded-3xl border border-neutral bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

        <div className="mb-3 flex items-center gap-2 text-primary">
          <FaMapMarkerAlt size={18} />

          <span className="text-lg font-bold">
            موقع العميل والتتبع المباشر
          </span>
        </div>

        <p className="text-sm text-textGray">
          {currentOrder.customerLocation?.coordinates ? (
            <LocationLabel
              lat={
                currentOrder.customerLocation.coordinates[1]
              }
              lng={
                currentOrder.customerLocation.coordinates[0]
              }
              icon={false}
            />
          ) : (
            "غير محدد"
          )}
        </p>

        {gpsPermissionDenied && (
          <AlertMessage
            type="error"
            message="يرجى السماح بالوصول إلى موقعك لتفعيل التتبع المباشر."
            className="mt-3"
          />
        )}

        {/* Handyman Arrival Notification & Trip Navigation Data */}
        {arrivalPending && !handymanArrived && (
          <AlertMessage
            type="info"
            message="جاري تأكيد موقعك على الخريطة..."
            className="mt-3"
          />
        )}

        {handymanArrived ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4">
              <FaCheck className="shrink-0 text-emerald-600" size={20} />
              <div>
                <p className="font-bold text-emerald-900">🎉 الحرفي وصل إلى موقع العميل</p>
                <p className="text-xs text-emerald-700">تم تسجيل الوصول بنجاح وتوقف التتبع المباشر.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  🛣️
                </div>
                <div>
                  <p className="text-xs font-semibold text-textGray">المسافة المتبقية</p>
                  <p className="text-base font-bold text-emerald-900">0 كم</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  ⏱️
                </div>
                <div>
                  <p className="text-xs font-semibold text-textGray">الوقت المتبقي</p>
                  <p className="text-base font-bold text-emerald-900">وصل</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          (distance !== null || displayedEta !== null) && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-borderGray bg-neutral/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  🛣️
                </div>
                <div>
                  <p className="text-xs font-semibold text-textGray">المسافة المتبقية</p>
                  <p className="text-base font-bold text-textDark">
                    {distance !== null ? `${distance} كم` : "جاري الحساب..."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  ⏱️
                </div>
                <div>
                  <p className="text-xs font-semibold text-textGray">الوقت المتبقي</p>
                  <p className="text-base font-bold text-textDark">
                    {displayedEta !== null
                      ? `${displayedEta < 1 ? "أقل من دقيقة" : `${Math.round(displayedEta)} دقيقة`}`
                      : "جاري الحساب..."}
                  </p>
                </div>
              </div>
            </div>
          )
        )}



        {showTrackingMap && (
          <div className="relative mt-4 h-72 w-full overflow-hidden rounded-2xl border border-neutral">
            {showMapSpinner ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
                <LoadingSpinner
                  text={
                    arrivalPending
                      ? 'جاري تأكيد الموقع على الخريطة...'
                      : 'جاري تحديد موقعك...'
                  }
                />
              </div>
            ) : null}

            {isTrackingLive && !mapCustomerLocation && !handymanArrived && (
              <p className="absolute bottom-2 left-0 right-0 z-10 text-center text-xs text-textGray">
                جاري تحديد موقع العميل...
              </p>
            )}

            <TrackingMap
              customerLocation={mapCustomerLocation}
              routeDestination={routeDestination ?? orderCustomerMapLoc}
              handymanLocation={handymanLoc}
              routeGeometry={routeGeometry}
              routeCalcTimestamp={routeCalcTimestamp}
              routeLoading={routeLoading}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        )}
      </div>

      {/* Pending */}
      {currentOrder.status === "pending" && (
        <div className="mb-6 rounded-3xl border border-neutral bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

          <label className="mb-2 block text-sm font-bold text-textDark">
            حدد السعر الذي تعرضه على العميل (ج.م)
          </label>

          <input
            type="number"
            min="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input-field mb-4"
            placeholder="مثال: 250"
          />

          <div className="flex flex-wrap gap-3">

            <button
              type="button"
              onClick={handleAccept}
              disabled={
                !price ||
                Number(price) <= 0 ||
                isLoading
              }
              className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaCheck />
              قبول وإرسال السعر
            </button>

            <button
              type="button"
              onClick={() => handleStatus("cancelled")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-emergency py-3 font-bold text-emergency"
            >
              <FaTimes />
              رفض
            </button>

          </div>
        </div>
      )}

      {/* Accepted */}
      {currentOrder.status === "accepted" && (
        <div className="mb-6 rounded-3xl border border-neutral bg-white p-6 text-center text-sm font-medium text-textGray shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          بانتظار موافقة العميل على السعر (
          {formatPrice(currentOrder.price)}
          )
        </div>
      )}

      {/* Price Confirmed */}
      {currentOrder.status === "price_confirmed" && (
        <div className="mb-6 rounded-3xl border border-neutral bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

          {currentOrder.requestType === "scheduled" && (
            <p className="mb-3 text-sm text-textGray">
              موعد الطلب:{" "}
              {formatDate(currentOrder.scheduledDate)}
            </p>
          )}

          {!currentOrder.isHandymanOnTheWay ? (
            <>
              {gpsStatus === 'initializing' && (
                <p className="mb-3 text-center text-sm text-textGray">
                  جاري تحديد موقعك...
                </p>
              )}
              {(gpsStatus === 'denied' || gpsPermissionDenied) && (
                <AlertMessage
                  type="error"
                  message="يرجى السماح بالوصول إلى موقعك للمتابعة."
                  className="mb-3"
                />
              )}
              {gpsStatus === 'error' && (
                <AlertMessage
                  type="error"
                  message="تعذر تحديد موقعك الحالي، حاول مرة أخرى."
                  className="mb-3"
                />
              )}
              {gpsStatus === 'error' && (
                <button
                  type="button"
                  onClick={retryGpsInit}
                  className="btn-outline mb-3 w-full"
                >
                  إعادة محاولة تحديد الموقع
                </button>
              )}
              <button
                type="button"
                onClick={handleOnTheWay}
                disabled={gpsStatus !== 'ready' || !handymanLoc}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {gpsStatus === 'initializing' ? 'جاري تحديد موقعك لتفعيل زر أنا قادم...' : 'أنا قادم للعميل'}
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-center text-sm text-textGray">
                تم تفعيل تتبع موقعك للعميل
              </p>

              <button
                type="button"
                onClick={() =>
                  handleStatus("in-progress")
                }
                className="btn-primary w-full"
              >
                بدء التنفيذ
              </button>
            </>
          )}

        </div>
      )}

      {/* In Progress */}
      {currentOrder.status === "in-progress" && (
        <div className="mb-6 rounded-3xl border border-neutral bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

          <label className="mb-2 block text-sm font-bold text-textDark">
            صورة إثبات إتمام العمل (مطلوبة)
          </label>

          {completionImage ? (
            <img
              src={completionImage}
              alt=""
              className="mb-3 h-32 w-32 rounded-lg object-cover"
            />
          ) : (
            <label className="mb-3 flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-borderGray text-textGray">

              <FaCamera size={20} />

              <span className="text-xs">
                {uploading
                  ? "جاري الرفع..."
                  : "إضافة صورة"}
              </span>

              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={handleCompletionImageChange}
              />

            </label>
          )}

          <button
            type="button"
            onClick={handleComplete}
            disabled={!completionImage || isLoading}
            className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            إتمام الطلب
          </button>

        </div>
      )}

      {/* Arrived — completion UI (identical to in-progress) */}
      {currentOrder.status === "arrived" && (
        <div className="mb-6 rounded-3xl border border-neutral bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

          <div className="mb-4 flex items-center gap-2 text-tertiary">
            <FaCheck size={18} />
            <span className="text-lg font-bold">الحرفي وصل — أتمم الطلب</span>
          </div>

          <label className="mb-2 block text-sm font-bold text-textDark">
            صورة إثبات إتمام العمل (مطلوبة)
          </label>

          {completionImage ? (
            <img
              src={completionImage}
              alt=""
              className="mb-3 h-32 w-32 rounded-lg object-cover"
            />
          ) : (
            <label className="mb-3 flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-borderGray text-textGray">
              <FaCamera size={20} />
              <span className="text-xs">
                {uploading ? "جاري الرفع..." : "إضافة صورة"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={handleCompletionImageChange}
              />
            </label>
          )}

          <button
            type="button"
            onClick={handleComplete}
            disabled={!completionImage || isLoading}
            className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            إتمام الطلب
          </button>

        </div>
      )}

      {/* Contact */}
      <div className="flex flex-wrap gap-3">

        <a
          href={`tel:${currentOrder.customerId?.phone}`}
          className="btn-outline flex flex-1 items-center justify-center gap-2"
        >
          <FaPhone />
          اتصال
        </a>

        <Link
          to={`/chat/${id}`}
          className="btn-outline flex flex-1 items-center justify-center gap-2"
        >
          <FaComments />
          محادثة
        </Link>

      </div>

      {/* Report */}
      {[
        "completed",
        "cancelled",
        "in-progress",
        "price_confirmed",
        "arrived",
      ].includes(currentOrder.status) && (
          <div className="mt-4 text-center">

            {reportSent ? (
              <p className="text-sm text-tertiary">
                تم إرسال بلاغك، سيقوم فريق الدعم بمراجعته
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="inline-flex items-center gap-2 text-sm text-emergency hover:underline"
              >
                <FaFlag size={12} />
                الإبلاغ عن مشكلة في هذا الطلب
              </button>
            )}

          </div>
        )}

      {/* Report Modal */}
      {reportOpen && (
        <ReasonModal
          title="سبب الإبلاغ عن هذا الطلب"
          confirmLabel="إرسال البلاغ"
          danger
          onConfirm={handleReport}
          onClose={() => setReportOpen(false)}
        />
      )}

    </div>
  );
}