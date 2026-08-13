import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaBell,
  FaComments,
  FaCheckCircle,
  FaPhone,
  FaTimes,
  FaClock,
  FaHourglassHalf,
  FaMoneyBillWave,
  FaBan,
  FaStar,
  FaFlag,
  FaMapMarkerAlt,
  FaWalking,
} from 'react-icons/fa';
import { fetchOrderById, updateOrderStatus, confirmOrderPrice } from '../../store/slices/orderSlice';
import { connectSocket, getSocketInstanceId } from '../../socket/socket';
import { reportService } from '../../services/api';
import TrackingMap from '../../components/Map/TrackingMap';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReasonModal from '../../components/common/ReasonModal';
import { formatPrice, formatDate, getDefaultAvatar } from '../../utils/helpers';
import useCurrentLocation from '../../hooks/useCurrentLocation';
import {
  isRouteConsistentWithPositions,
  isValidGpsCoord,
  haversineKm,
  normalizeGpsLocation,
  parseOrderCustomerLocation,
} from '../../utils/routeValidation';
import AlertMessage from '../../components/common/AlertMessage';

const clearRouteState = (refs, setters) => {
  refs.lastTrustedEtaRef.current = null;
  refs.etaTimestampRef.current = null;
  setters.setRouteGeometry(null);
  setters.setDistance(null);
  setters.setLastTrustedEta(null);
  setters.setEtaTimestamp(null);
  setters.setDisplayedEta(null);
};

/** Re-emit live customer GPS while tracking so handyman always receives customerLocationUpdate */
const CUSTOMER_GPS_HEARTBEAT_MS = 12000;
const CUSTOMER_GPS_MIN_EMIT_MS = 3000;
const CUSTOMER_GPS_MIN_MOVE_M = 5;

// ─── ETA Formatting ─────────────────────────────────────────────────────────
const formatEta = (minutes) => {
  if (minutes === null || minutes === undefined) return null;
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return 'أقل من دقيقة';
  if (m === 1) return 'دقيقة واحدة';
  if (m <= 10) return `${m} دقائق`;
  return `${m} دقيقة`;
};

// ─── Distance Formatting ─────────────────────────────────────────────────────
const formatDistance = (km) => {
  if (km === null || km === undefined) return null;
  if (km < 1) return `${Math.round(km * 1000)} م`;
  return `${km.toFixed(1)} كم`;
};

export default function TrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading, error } = useSelector((state) => state.orders);
  const { token } = useSelector((state) => state.auth);

  const { location, error: locationError, loading: locationLoading } = useCurrentLocation({
    fallbackOnError: false,
    tracking: true,
  });

  const [handymanLoc, setHandymanLoc] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [routeCalcTimestamp, setRouteCalcTimestamp] = useState(null);
  const [routeDestination, setRouteDestination] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [distance, setDistance] = useState(null);       // km from TomTom
  const [trafficDelay, setTrafficDelay] = useState(null);
  const [handymanArrived, setHandymanArrived] = useState(false);

  // ─── ETA state managed with timestamps for local countdown ────────────────
  // lastTrustedEta:     the ETA (in minutes) received from TomTom
  // etaTimestamp:       Date.now() when that ETA was received
  // displayedEta:       derived value shown to user (counts down locally)
  const [lastTrustedEta, setLastTrustedEta] = useState(null);
  const [etaTimestamp, setEtaTimestamp] = useState(null);
  const [displayedEta, setDisplayedEta] = useState(null);

  // Refs for reading latest ETA values inside socket closures (stale-closure safe)
  const lastTrustedEtaRef = useRef(null);
  const etaTimestampRef = useRef(null);
  const handymanLocRef = useRef(null);
  const locationRef = useRef(null);
  const pendingCustomerLocationRef = useRef(null);
  const customerSocketRef = useRef(null);
  const handymanArrivedRef = useRef(false);
  const routeDestinationRef = useRef(null);
  const currentOrderRef = useRef(null);
  const isCustomerJoinedRef = useRef(false);
  const customerJoinPendingRef = useRef(false);
  const customerJoinSocketIdRef = useRef(null);
  const emitCustomerLocationRef = useRef(() => {});
  const emitJoinOnceRef = useRef(() => {});
  const lastCustomerEmitRef = useRef({ lat: null, lng: null, ts: 0 });
  const locationUpdateListenerRef = useRef(null);
  const locationUpdateHandlerRef = useRef(null);

  const canSendCustomerGps = (order) =>
    order &&
    ['price_confirmed', 'in-progress'].includes(order.status) &&
    !handymanArrivedRef.current;

  const isLiveTracking = (order) =>
    order &&
    !handymanArrivedRef.current &&
    ((order.status === 'price_confirmed' && order.isHandymanOnTheWay) ||
      order.status === 'in-progress');

  useEffect(() => {
    currentOrderRef.current = currentOrder;
    const orderDest = parseOrderCustomerLocation(currentOrder);
    if (orderDest) {
      routeDestinationRef.current = routeDestinationRef.current ?? orderDest;
      setRouteDestination((prev) => prev ?? orderDest);
    }
  }, [currentOrder]);

  // ─── Fetch order once ─────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(fetchOrderById(orderId));
  }, [dispatch, orderId]);

  // ─── Poll order while active ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentOrder || ['completed', 'cancelled'].includes(currentOrder.status)) return;
    const interval = setInterval(() => dispatch(fetchOrderById(orderId)), 8000);
    return () => clearInterval(interval);
  }, [dispatch, orderId, currentOrder?.status]);

  // ─── Socket + customer GPS emission ───────────────────────────────────────
  const trackingSocketKey =
    orderId &&
    token &&
    currentOrder &&
    ['price_confirmed', 'in-progress'].includes(currentOrder.status) &&
    !handymanArrivedRef.current
      ? `${orderId}:tracking`
      : null;

  useEffect(() => {
    if (!trackingSocketKey) return;

    const socket = connectSocket(token);
    customerSocketRef.current = socket;

    console.log('[SOCKET AUDIT] CUSTOMER SOCKET', {
      socketInstanceId: getSocketInstanceId(),
      socketId: socket.id,
      connected: socket.connected,
      orderId,
      room: String(orderId),
      sameRefAsCustomerSocketRef: socket === customerSocketRef.current,
    });

    console.log('[SOCKET AUDIT] CUSTOMER TRACKING STATE', {
      status: currentOrder?.status ?? null,
      isHandymanOnTheWay: currentOrder?.isHandymanOnTheWay ?? null,
      canSendGps: canSendCustomerGps(currentOrder),
      socketConnected: socket.connected,
      socketInstanceId: getSocketInstanceId(),
    });

    const emitCustomerLocation = (options = {}) => {
      const { force = false } = options;
      const loc = locationRef.current ?? pendingCustomerLocationRef.current;
      if (!loc || !isValidGpsCoord(loc.latitude, loc.longitude)) return;
      if (!canSendCustomerGps(currentOrderRef.current)) return;

      const now = Date.now();
      const last = lastCustomerEmitRef.current;
      if (!force && last.lat != null && last.lng != null) {
        const movedM = haversineKm(
          { latitude: last.lat, longitude: last.lng },
          loc
        ) * 1000;
        if (now - last.ts < CUSTOMER_GPS_MIN_EMIT_MS && movedM < CUSTOMER_GPS_MIN_MOVE_M) {
          return;
        }
      }

      locationRef.current = loc;
      pendingCustomerLocationRef.current = loc;

      const payload = {
        orderId,
        lat: loc.latitude,
        lng: loc.longitude,
        latitude: loc.latitude,
        longitude: loc.longitude,
      };

      if (!socket.connected) {
        pendingCustomerLocationRef.current = loc;
        console.log('📦 [CUSTOMER SOCKET] GPS queued — socket not connected yet');
        return;
      }

      if (!isCustomerJoinedRef.current) {
        pendingCustomerLocationRef.current = loc;
        console.log('[SOCKET AUDIT][CUSTOMER SEND] blocked — awaiting joinOrderRoomAck', {
          socketId: socket.id,
          orderId,
        });
        emitJoinOnceRef.current();
        return;
      }

      lastCustomerEmitRef.current = {
        lat: loc.latitude,
        lng: loc.longitude,
        ts: now,
      };

      console.log('[SOCKET AUDIT][CUSTOMER SEND]', {
        socketInstanceId: getSocketInstanceId(),
        socketId: socket.id,
        orderId,
        room: String(orderId),
        lat: loc.latitude,
        lng: loc.longitude,
        isCustomerJoined: isCustomerJoinedRef.current,
        isLiveTracking: isLiveTracking(currentOrderRef.current),
      });
      socket.emit('sendCustomerLocation', payload);
    };

    emitCustomerLocationRef.current = emitCustomerLocation;

    const onLocationUpdate = (payload) => {
      const numLat = Number(payload?.lat);
      const numLng = Number(payload?.lng);
      console.log('[SOCKET AUDIT][CUSTOMER HANDYMAN LOCATION RECEIVED]', {
        socketId: socket.id,
        socketInstanceId: getSocketInstanceId(),
        orderId,
        room: String(orderId),
        payload,
        lat: numLat,
        lng: numLng,
        replay: payload?.replay ?? false,
      });
      console.log('[FRONTEND HANDYMAN LOCATION RECEIVED]', {
        event: 'locationUpdate',
        payload,
      });

      const {
        lat,
        lng,
        distanceRemaining,
        eta,
        trafficDelay: delay,
        geometry,
        etaTimestamp: serverEtaTs,
        routeCalcTimestamp,
      } = payload;

      console.log('[CUSTOMER] locationUpdate | handyman =', { lat, lng }, '| distance =', distanceRemaining, '| eta =', eta, '| routeCalcTimestamp =', routeCalcTimestamp ? new Date(routeCalcTimestamp).toISOString() : 'N/A');

      if (Number.isFinite(numLat) && Number.isFinite(numLng) && isValidGpsCoord(numLat, numLng)) {
        const handy = { latitude: numLat, longitude: numLng };
        console.log('[HANDYMAN LOCATION STATE UPDATE]', {
          previous: handymanLocRef.current,
          next: handy,
        });
        handymanLocRef.current = handy;
        setHandymanLoc(handy);
      } else {
        console.warn('[CUSTOMER] locationUpdate ignored — invalid handyman lat/lng', { lat, lng, numLat, numLng });
      }

      const payloadDest = normalizeGpsLocation(payload?.customerLat, payload?.customerLng);
      if (payloadDest) {
        routeDestinationRef.current = payloadDest;
        setRouteDestination(payloadDest);
      }

      if (handymanArrivedRef.current) return;

      const handyman = handymanLocRef.current;
      const customer =
        routeDestinationRef.current ??
        parseOrderCustomerLocation(currentOrderRef.current);

      if (!handyman || !customer) {
        return;
      }

      if (!isRouteConsistentWithPositions(distanceRemaining, handyman, customer)) {
        console.warn('[CUSTOMER] Stale route rejected | route =', distanceRemaining, 'km | direct =', handyman && customer ? haversineKm(handyman, customer).toFixed(3) : 'N/A', 'km');
        clearRouteState(
          { lastTrustedEtaRef, etaTimestampRef },
          { setRouteGeometry, setDistance, setLastTrustedEta, setEtaTimestamp, setDisplayedEta }
        );
        setRouteCalcTimestamp(null);
        return;
      }

      if (routeCalcTimestamp) setRouteCalcTimestamp(routeCalcTimestamp);

      if (Array.isArray(geometry) && geometry.length >= 2) {
        console.log('[CUSTOMER] route geometry points =', geometry.length);
        setRouteGeometry(geometry);
      }

      if (distanceRemaining !== undefined && distanceRemaining !== null) {
        console.log('[CUSTOMER] distanceRemaining =', distanceRemaining, 'km');
        setDistance(distanceRemaining);
      }


      // ── Controlled ETA recalculation ────────────────────────────────────
      if (eta !== undefined && eta !== null) {
        const now = serverEtaTs || Date.now();
        console.log('⏱️ ETA UPDATE | TomTom ETA =', eta, 'min at', new Date(now).toISOString());


        // Read latest values from refs — avoids stale closure
        const prevEta = lastTrustedEtaRef.current;
        const prevTs = etaTimestampRef.current;

        let shouldAccept = true;

        if (prevEta !== null && prevTs !== null) {
          const elapsedMin = (Date.now() - prevTs) / 60000;
          const expectedEta = Math.max(0, prevEta - elapsedMin);
          const diff = eta - expectedEta;

          if (diff > 10) {
            // Large ETA jump — cross-validate against route distance.
            // A genuine traffic/reroute increase should produce a distance
            // that is consistent with the new ETA at a reasonable urban speed.
            const distKm = distanceRemaining ?? null;

            if (distKm !== null) {
              const avgSpeedKmh = 30; // conservative urban speed for validation
              const impliedEtaMin = (distKm / avgSpeedKmh) * 60;
              const etaDistConsistent = Math.abs(eta - impliedEtaMin) <= 15;

              if (etaDistConsistent) {
                console.warn(
                  `⚠️ ETA JUMP | Expected ~${expectedEta.toFixed(1)} min, got ${eta} min (+${diff.toFixed(1)} min). ` +
                  `Distance ${distKm}km implies ~${impliedEtaMin.toFixed(1)} min — ACCEPTING (traffic/reroute).`
                );
              } else {
                console.warn(
                  `⚠️ ETA JUMP | Expected ~${expectedEta.toFixed(1)} min, got ${eta} min (+${diff.toFixed(1)} min). ` +
                  `Distance ${distKm}km implies ~${impliedEtaMin.toFixed(1)} min — SUSPICIOUS. Keeping countdown.`
                );
                shouldAccept = false;
              }
            } else {
              // No distance data to validate — accept with a warning
              console.warn(
                `⚠️ ETA JUMP | Expected ~${expectedEta.toFixed(1)} min, got ${eta} min (+${diff.toFixed(1)} min). ` +
                `No distance data for cross-validation — ACCEPTING cautiously.`
              );
            }
          }
        }

        if (shouldAccept) {
          lastTrustedEtaRef.current = eta;
          etaTimestampRef.current = now;
          setLastTrustedEta(eta);
          setEtaTimestamp(now);
          setDisplayedEta(eta);
        }
      }
      // ────────────────────────────────────────────────────────────────────

      if (delay !== undefined) setTrafficDelay(delay);
    };

    const onHandymanArrived = (payload) => {
      console.log('✅ HANDYMAN ARRIVED | Customer received arrival event', payload);
      handymanArrivedRef.current = true;
      lastTrustedEtaRef.current = null;
      etaTimestampRef.current = null;
      setHandymanArrived(true);
      // Clear route & countdown tracking state
      setRouteGeometry(null);
      setDistance(0);
      setLastTrustedEta(null);
      setEtaTimestamp(null);
      setDisplayedEta(0);
      setTrafficDelay(null);
    };



    const onTrackingStarted = () => {
      dispatch(fetchOrderById(orderId));
    };

    const onJoinOrderRoomAck = (ack) => {
      customerJoinPendingRef.current = false;
      console.log('[SOCKET AUDIT][CUSTOMER JOIN ACK]', {
        socketInstanceId: getSocketInstanceId(),
        socketId: socket.id,
        orderId,
        ack,
      });
      if (ack?.success) {
        isCustomerJoinedRef.current = true;
        customerJoinSocketIdRef.current = socket.id;
        console.log('[SOCKET AUDIT] CUSTOMER joined order room — emitting live GPS', {
          socketId: socket.id,
          orderId,
        });
        emitCustomerLocation({ force: true });
      } else {
        isCustomerJoinedRef.current = false;
        customerJoinSocketIdRef.current = null;
      }
    };

    const emitJoinOnce = () => {
      if (isCustomerJoinedRef.current && customerJoinSocketIdRef.current === socket.id) {
        console.log('[SOCKET AUDIT] CUSTOMER joinOrderRoom SKIPPED — already joined', {
          socketId: socket.id,
          orderId,
        });
        return;
      }
      if (customerJoinPendingRef.current && customerJoinSocketIdRef.current === socket.id) {
        console.log('[SOCKET AUDIT] CUSTOMER joinOrderRoom SKIPPED — join pending', {
          socketId: socket.id,
          orderId,
        });
        return;
      }
      customerJoinPendingRef.current = true;
      customerJoinSocketIdRef.current = socket.id;
      console.log('[SOCKET AUDIT] CUSTOMER joinOrderRoom EMIT', {
        socketInstanceId: getSocketInstanceId(),
        socketId: socket.id,
        orderId,
        room: String(orderId),
      });
      socket.emit('joinOrderRoom', orderId);
    };

    emitJoinOnceRef.current = emitJoinOnce;

    locationUpdateHandlerRef.current = onLocationUpdate;

    const bindLocationUpdateListener = () => {
      if (!locationUpdateListenerRef.current) {
        locationUpdateListenerRef.current = (payload) => {
          locationUpdateHandlerRef.current?.(payload);
        };
      }
      socket.off('locationUpdate', locationUpdateListenerRef.current);
      socket.on('locationUpdate', locationUpdateListenerRef.current);
    };

    const onConnect = () => {
      isCustomerJoinedRef.current = false;
      customerJoinPendingRef.current = false;
      customerJoinSocketIdRef.current = socket.id;
      console.log('[SOCKET AUDIT] customer socket connected — prepare join', {
        socketInstanceId: getSocketInstanceId(),
        socketId: socket.id,
        orderId,
      });
      bindLocationUpdateListener();
      console.log('[SOCKET AUDIT][CUSTOMER LOCATION LISTENER READY]', {
        socketId: socket.id,
        orderId,
      });
      emitJoinOnce();
    };

    const onDisconnect = () => {
      console.log('[SOCKET AUDIT] CUSTOMER socket disconnected — reset join state', {
        orderId,
        socketId: socket.id,
      });
      isCustomerJoinedRef.current = false;
      customerJoinPendingRef.current = false;
      customerJoinSocketIdRef.current = null;
    };

    bindLocationUpdateListener();
    console.log('[SOCKET AUDIT][CUSTOMER LOCATION LISTENER READY]', {
      socketId: socket.id,
      orderId,
    });
    console.log('[SOCKET AUDIT] CUSTOMER locationUpdate LISTENER REGISTERED', {
      socketInstanceId: getSocketInstanceId(),
      socketId: socket.id,
      orderId,
      listenerBeforeJoin: true,
    });
    socket.on('handymanArrived', onHandymanArrived);
    socket.on('trackingStarted', onTrackingStarted);
    socket.on('joinOrderRoomAck', onJoinOrderRoomAck);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      onConnect();
    } else {
      console.log('📦 [CUSTOMER SOCKET] Waiting for socket connect before join/send');
    }

    const heartbeatId = setInterval(() => {
      if (!canSendCustomerGps(currentOrderRef.current)) return;
      if (!isLiveTracking(currentOrderRef.current)) return;
      if (!socket.connected) return;
      emitCustomerLocation({ force: true });
    }, CUSTOMER_GPS_HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeatId);
      emitCustomerLocationRef.current = () => {};
      emitJoinOnceRef.current = () => {};
      console.log('[SOCKET AUDIT] CUSTOMER locationUpdate LISTENER REMOVED', { orderId });
      isCustomerJoinedRef.current = false;
      customerJoinPendingRef.current = false;
      customerJoinSocketIdRef.current = null;
      customerSocketRef.current = null;
      socket.emit('leaveOrderRoom', orderId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      if (locationUpdateListenerRef.current) {
        socket.off('locationUpdate', locationUpdateListenerRef.current);
      }
      socket.off('handymanArrived', onHandymanArrived);
      socket.off('trackingStarted', onTrackingStarted);
      socket.off('joinOrderRoomAck', onJoinOrderRoomAck);
    };
  }, [orderId, token, trackingSocketKey]);

  // Re-join once when handyman starts heading over (no socket effect teardown)
  useEffect(() => {
    if (!orderId || !token || !currentOrder) return;
    if (!currentOrder.isHandymanOnTheWay && currentOrder.status !== 'in-progress') return;
    if (!canSendCustomerGps(currentOrder)) return;

    const socket = customerSocketRef.current ?? connectSocket(token);
    if (!socket.connected) return;

    console.log('[SOCKET AUDIT] CUSTOMER live tracking started', {
      orderId,
      socketId: socket.id,
      isHandymanOnTheWay: currentOrder.isHandymanOnTheWay,
      status: currentOrder.status,
      isCustomerJoined: isCustomerJoinedRef.current,
    });

    if (isCustomerJoinedRef.current && customerJoinSocketIdRef.current === socket.id) {
      emitCustomerLocationRef.current();
      return;
    }

    emitJoinOnceRef.current();
  }, [
    orderId,
    token,
    currentOrder?.isHandymanOnTheWay,
    currentOrder?.status,
  ]);

  // Emit when live GPS arrives or updates (fixes GPS-before-socket race)
  useEffect(() => {
    if (!location || !isValidGpsCoord(location.latitude, location.longitude)) return;
    if (!canSendCustomerGps(currentOrder)) return;

    locationRef.current = location;
    pendingCustomerLocationRef.current = location;

    if (!customerSocketRef.current?.connected) {
      console.log('📦 [CUSTOMER SOCKET] GPS ready — waiting for socket connect');
      return;
    }

    emitCustomerLocationRef.current();
  }, [
    orderId,
    token,
    location?.latitude,
    location?.longitude,
    currentOrder?.status,
    currentOrder?.isHandymanOnTheWay,
  ]);


  // ─── Local ETA countdown (timestamp-based, not counter-based) ────────────
  useEffect(() => {
    if (lastTrustedEta === null || etaTimestamp === null || handymanArrived) return;

    const tick = () => {
      const elapsedMin = (Date.now() - etaTimestamp) / 60000;
      const current = Math.max(0, lastTrustedEta - elapsedMin);
      console.log(`⏳ ETA COUNTDOWN | ${current.toFixed(1)} min remaining`);
      setDisplayedEta(current);
    };

    tick(); // run immediately
    const timer = setInterval(tick, 30000); // update every 30 seconds
    return () => clearInterval(timer);
  }, [lastTrustedEta, etaTimestamp, handymanArrived]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleCancel = () => {
    dispatch(updateOrderStatus({ id: orderId, status: 'cancelled' }));
  };

  const handleConfirmPrice = (confirmed) => {
    dispatch(confirmOrderPrice({ id: orderId, confirmed }));
  };

  const handleReport = async (reason) => {
    await reportService.fileReport(orderId, { reason });
    setReportSent(true);
    dispatch(fetchOrderById(orderId));
  };

  const ReportButton = () =>
    reportSent ? (
      <p className="text-sm text-tertiary">تم إرسال بلاغك، سيقوم فريق الدعم بمراجعته</p>
    ) : (
      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="inline-flex items-center gap-2 text-sm text-emergency hover:underline"
      >
        <FaFlag size={12} /> الإبلاغ عن مشكلة في هذا الطلب
      </button>
    );

  if (isLoading && !currentOrder) return <LoadingSpinner fullScreen />;

  if (!currentOrder) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-white p-6 text-center">
        <p className="font-bold text-textDark">تعذر تحميل تفاصيل الطلب</p>
        {error && <p className="text-sm text-textGray">{error}</p>}
        <button type="button" onClick={() => navigate(-1)} className="btn-outline">
          رجوع
        </button>
      </div>
    );
  }

  const handyman = currentOrder.handymanId || {};
  const status = currentOrder.status;

  const Header = ({ title }) => (
    <header className="flex shrink-0 items-center justify-between border-b border-borderGray px-4 py-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={18} />
        </button>
        <h1 className="font-bold text-primary">{title}</h1>
      </div>
      <div className="flex gap-3 text-primary">
        <FaBell />
        <Link to={`/chat/${orderId}`}><FaComments /></Link>
      </div>
    </header>
  );

  // ===== CANCELLED =====
  if (status === 'cancelled') {
    return (
      <div className="fixed inset-0 flex flex-col overflow-y-auto bg-white">
        <Header title="الطلب" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaBan className="text-emergency" size={48} />
          <h2 className="text-xl font-bold text-textDark">تم إلغاء هذا الطلب</h2>
          <div className="card w-full max-w-sm text-right">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">رقم الطلب</span>
              <span className="font-medium text-textDark">#{String(orderId).slice(-6)}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">الخدمة</span>
              <span className="font-medium text-textDark">{currentOrder.profession}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">الحرفي</span>
              <span className="font-medium text-textDark">{handyman.name || '—'}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">تاريخ الطلب</span>
              <span className="font-medium text-textDark">{formatDate(currentOrder.createdAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-textGray">السعر</span>
              <span className="font-medium text-textDark">
                {formatPrice(currentOrder.price ?? currentOrder.estimatedPrice)}
              </span>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/customer/home')} className="btn-primary">
            العودة للرئيسية
          </button>
          <ReportButton />
        </div>
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

  // ===== COMPLETED =====
  if (status === 'completed') {
    return (
      <div className="fixed inset-0 flex flex-col overflow-y-auto bg-white">
        <Header title="الطلب" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaCheckCircle className="text-tertiary" size={48} />
          <h2 className="text-xl font-bold text-textDark">تم إنجاز الطلب بنجاح</h2>
          <p className="text-sm text-textGray">لا تنسَ تقييم {handyman.name || 'الحرفي'}</p>

          <div className="card w-full max-w-sm text-right">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">رقم الطلب</span>
              <span className="font-medium text-textDark">#{String(orderId).slice(-6)}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">الخدمة</span>
              <span className="font-medium text-textDark">{currentOrder.profession}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">الحرفي</span>
              <span className="font-medium text-textDark">{handyman.name || '—'}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">المبلغ المدفوع</span>
              <span className="font-bold text-secondary">{formatPrice(currentOrder.price)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-textGray">حالة الدفع</span>
              <span className={currentOrder.paymentStatus === 'paid' ? 'font-medium text-tertiary' : 'font-medium text-emergency'}>
                {currentOrder.paymentStatus === 'paid' ? 'تم الدفع' : 'لم يتم الدفع بعد'}
              </span>
            </div>
          </div>

          {currentOrder.completionImage && (
            <div className="w-full max-w-sm text-right">
              <p className="mb-2 text-sm font-bold text-textDark">صورة إثبات إتمام العمل</p>
              <img src={currentOrder.completionImage} alt="" className="h-32 w-32 rounded-lg object-cover" />
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate(`/customer/review/${orderId}`)}
            className="btn-secondary flex items-center gap-2"
          >
            <FaStar /> قيّم الحرفي
          </button>
          <ReportButton />
        </div>
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

  // ===== PENDING =====
  if (status === 'pending') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="بانتظار الحرفي" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaHourglassHalf className="animate-pulse text-primary" size={48} />
          <h2 className="text-xl font-bold text-textDark">تم إرسال طلبك</h2>
          <p className="max-w-xs text-sm text-textGray">
            بانتظار موافقة {handyman.name || 'الحرفي'} على طلبك. سيصلك إشعار فور قبول الطلب.
          </p>
          <div className="card w-full max-w-sm text-right">
            <p className="text-sm text-textGray">الخدمة المطلوبة</p>
            <p className="font-bold text-textDark">{currentOrder.profession}</p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center gap-2 rounded-xl border-2 border-emergency px-6 py-3 font-bold text-emergency"
          >
            <FaTimes /> إلغاء الطلب
          </button>
        </div>
      </div>
    );
  }

  // ===== ACCEPTED =====
  if (status === 'accepted') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تأكيد السعر" />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="flex items-center gap-3">
            <img src={getDefaultAvatar(handyman.name)} alt="" className="h-14 w-14 rounded-full object-cover" />
            <div className="text-right">
              <p className="font-bold text-textDark">{handyman.name || 'الحرفي'}</p>
              <p className="text-xs text-textGray">قبل طلبك وحدد السعر</p>
            </div>
          </div>
          <div className="card w-full max-w-sm">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold text-primary">
              <FaMoneyBillWave /> {formatPrice(currentOrder.price ?? currentOrder.estimatedPrice)}
            </div>
            <p className="mt-1 text-xs text-textGray">السعر المقترح لإتمام الخدمة</p>
          </div>
          <div className="flex w-full max-w-sm gap-3">
            <button
              type="button"
              onClick={() => handleConfirmPrice(true)}
              disabled={isLoading}
              className="btn-secondary flex-1"
            >
              أوافق على السعر
            </button>
            <button
              type="button"
              onClick={() => handleConfirmPrice(false)}
              disabled={isLoading}
              className="flex-1 rounded-xl border-2 border-emergency py-3 font-bold text-emergency"
            >
              رفض وإلغاء
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== price_confirmed & handyman hasn't started heading over yet =====
  if (status === 'price_confirmed' && !currentOrder.isHandymanOnTheWay) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title={currentOrder.requestType === 'scheduled' ? 'موعد الطلب' : 'جاري التجهيز'} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaClock className="text-primary" size={48} />
          {currentOrder.requestType === 'scheduled' ? (
            <>
              <h2 className="text-xl font-bold text-textDark">لديك موعد محجوز</h2>
              <p className="max-w-xs text-sm text-textGray">
                سيتحرك {handyman.name || 'الحرفي'} إليك عند اقتراب الموعد وستظهر لك خريطة التتبع تلقائياً.
              </p>
              <div className="card w-full max-w-sm">
                <p className="text-sm text-textGray">موعد الطلب</p>
                <p className="font-bold text-textDark">{formatDate(currentOrder.scheduledDate)}</p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-textDark">تم تأكيد السعر</h2>
              <p className="max-w-xs text-sm text-textGray">
                {handyman.name || 'الحرفي'} بيستعد للتحرك ناحيتك، هتظهر خريطة التتبع فور تحركه.
              </p>
            </>
          )}
          <div className="flex w-full max-w-sm gap-4">
            <a
              href={handyman.phone ? `tel:${handyman.phone}` : undefined}
              className="flex flex-1 items-center justify-center gap-2 text-primary"
            >
              <FaPhone /> الاتصال بالحرفي
            </a>
            <button
              type="button"
              onClick={handleCancel}
              className="flex flex-1 items-center justify-center gap-2 text-emergency"
            >
              <FaTimes /> إلغاء الطلب
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== DISPUTED =====
  if (status === 'disputed') {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تتبع الطلب" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertMessage
            type="info"
            message="هذا الطلب قيد مراجعة من فريق الدعم. التتبع المباشر متوقف مؤقتاً."
            className="max-w-md"
          />
          <button type="button" onClick={() => navigate(-1)} className="btn-outline">
            رجوع
          </button>
        </div>
      </div>
    );
  }

  // ===== ✅ LIVE TRACKING (price_confirmed on-way / in-progress) =====

  const orderCustomerLocation = parseOrderCustomerLocation(currentOrder);

  const liveCustomerLocation =
    location && isValidGpsCoord(location.latitude, location.longitude) ? location : null;

  const mapCustomerLocation = orderCustomerLocation;

  const hasValidHandymanLoc =
    handymanLoc &&
    isValidGpsCoord(handymanLoc.latitude, handymanLoc.longitude);

  const canShowMap = !!(mapCustomerLocation || hasValidHandymanLoc);

  if (!orderCustomerLocation && !liveCustomerLocation && locationLoading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تتبع الطلب" />
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner text="جاري تحديد موقعك..." />
        </div>
      </div>
    );
  }

  if (!orderCustomerLocation && !liveCustomerLocation && locationError) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تتبع الطلب" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <AlertMessage
            type="error"
            message="يرجى السماح بالوصول إلى موقعك لتفعيل التتبع المباشر."
            className="max-w-md"
          />
          <p className="text-sm text-textGray text-center">{locationError}</p>
        </div>
      </div>
    );
  }


  const formattedEta = formatEta(displayedEta);
  const formattedDistance = formatDistance(distance);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white">
      <Header title="تتبع الطلب" />

      <div className="relative min-h-0 w-full flex-1">
        {canShowMap ? (
          <TrackingMap
            customerLocation={mapCustomerLocation}
            routeDestination={routeDestination ?? orderCustomerLocation}
            handymanLocation={hasValidHandymanLoc ? handymanLoc : null}
            routeGeometry={handymanArrived ? null : routeGeometry}
            routeCalcTimestamp={routeCalcTimestamp}
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-neutral">
            <LoadingSpinner text="جاري تحديد موقعك..." />
          </div>
        )}

        {!liveCustomerLocation && locationError && orderCustomerLocation && (
          <div className="absolute top-4 left-1/2 z-10 w-[90%] max-w-md -translate-x-1/2">
            <AlertMessage
              type="info"
              message="تعذر تحديث موقعك المباشر. الخريطة تعرض عنوان الطلب المحجوز."
            />
          </div>
        )}

        {handymanArrived && (
          <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-2xl border border-tertiary/30 bg-white px-5 py-3 shadow-lg">
            <span className="flex items-center gap-2 text-sm font-bold text-tertiary">
              <FaCheckCircle />
              الحرفي وصل إلى موقعك
            </span>
          </div>
        )}

        {/* ETA + Distance floating pill */}
        {!handymanArrived && hasValidHandymanLoc && (formattedEta || formattedDistance) && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-2xl border border-primary/20 bg-white px-5 py-3 shadow-lg">
            {formattedEta && (
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                <FaClock />
                سيصل بعد {formattedEta}
              </span>
            )}
            {formattedDistance && (
              <span className="mt-1 flex items-center gap-1 text-xs text-secondary">
                <FaMapMarkerAlt size={10} />
                {formattedDistance} متبقية
              </span>
            )}
          </div>
        )}

        {/* Traffic delay badge */}
        {trafficDelay > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-emergency/10 px-4 py-2 shadow-md">
            <span className="flex items-center gap-2 text-sm font-medium text-emergency">
              ⚠️ تأخر {Math.round(trafficDelay)} دقائق بسبب حركة المرور
            </span>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <div className="shrink-0 rounded-t-2xl border-t border-borderGray bg-white p-4 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-borderGray" />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <FaCheckCircle className={handymanArrived ? 'text-tertiary' : 'text-tertiary'} />
            <span className="font-bold">
              {handymanArrived
                ? 'الحرفي وصل!'
                : status === 'in-progress'
                  ? 'الحرفي يعمل على طلبك'
                  : 'تم تأكيد السعر — الحرفي في الطريق'}
            </span>
          </div>
          <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
            #{String(orderId).slice(-5)}
          </span>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-neutral p-4">
          <div className="flex items-center gap-3">
            <img
              src={getDefaultAvatar(handyman.name)}
              alt=""
              className="h-14 w-14 rounded-lg object-cover"
            />
            <div>
              <p className="font-bold text-textDark">{handyman.name || 'الحرفي'}</p>
              <p className="text-xs text-textGray">خبير {currentOrder.profession} معتمد</p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-xs text-textGray">رسوم الخدمة</p>
            <p className="font-bold text-textDark">{formatPrice(currentOrder.price || currentOrder.estimatedPrice)}</p>
            {formattedDistance && (
              <>
                <p className="mt-1 text-xs text-textGray">المسافة المتبقية</p>
                <p className="font-bold text-secondary">{formattedDistance}</p>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <a
            href={handyman.phone ? `tel:${handyman.phone}` : undefined}
            className="flex flex-1 items-center justify-center gap-2 text-primary"
          >
            <FaPhone /> الاتصال بالحرفي
          </a>
          <button
            type="button"
            onClick={handleCancel}
            className="flex flex-1 items-center justify-center gap-2 text-emergency"
          >
            <FaTimes /> إلغاء الطلب
          </button>
        </div>
        <div className="mt-3 text-center">
          <ReportButton />
        </div>
      </div>

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