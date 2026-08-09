import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
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
} from "react-icons/fa";
import {
  fetchOrderById,
  updateOrderStatus,
  confirmOrderPrice,
} from "../../store/slices/orderSlice";
import { connectSocket } from "../../socket/socket";
import { reportService } from "../../services/api";
import TrackingMap from "../../components/Map/TrackingMap";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import ReasonModal from "../../components/common/ReasonModal";
import { formatPrice, formatDate, getDefaultAvatar } from "../../utils/helpers";
import useCurrentLocation from "../../hooks/useCurrentLocation";

export default function TrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading, error } = useSelector(
    (state) => state.orders,
  );
  const { token } = useSelector((state) => state.auth);

  const { location, loading: locationLoading } = useCurrentLocation();

  const [handymanLoc, setHandymanLoc] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [distance, setDistance] = useState(null);
  const [eta, setEta] = useState(null);
  const [trafficDelay, setTrafficDelay] = useState(null);
  const [arrivalTime, setArrivalTime] = useState(null);

  useEffect(() => {
    dispatch(fetchOrderById(orderId));
  }, [dispatch, orderId]);

  useEffect(() => {
    if (
      !currentOrder ||
      ["completed", "cancelled"].includes(currentOrder.status)
    )
      return;
    const interval = setInterval(() => dispatch(fetchOrderById(orderId)), 8000);
    return () => clearInterval(interval);
  }, [dispatch, orderId, currentOrder?.status]);

  useEffect(() => {
    if (!orderId || !token) return;

    // connectSocket() is idempotent (returns the existing socket if already
    // connected). We call it here too — instead of relying solely on
    // AuthInit's useSocket() — because React fires child effects before
    // parent effects. On a hard reload of /customer/tracking/:orderId this
    // effect used to run before AuthInit's useSocket() had called
    // connectSocket(), so getSocket() returned null, the room was never
    // joined, and every 'locationUpdate' the handyman sent was missed — the
    // live map never appeared (it only ever showed a stale snapshot via the
    // 8s REST poll).
    const socket = connectSocket(token);

    socket.emit("joinOrderRoom", orderId);

    socket.on(
      "locationUpdate",
      ({ lat, lng, distanceRemaining, eta, trafficDelay, arrivalTime }) => {
        setHandymanLoc({ latitude: lat, longitude: lng });

        if (distanceRemaining !== undefined) setDistance(distanceRemaining);
        if (eta !== undefined) setEta(eta);
        if (trafficDelay !== undefined) setTrafficDelay(trafficDelay);
        if (arrivalTime !== undefined) setArrivalTime(arrivalTime);
      },
    );

    socket.on("tracking-started", () => {
      dispatch(fetchOrderById(orderId));
    });

    return () => {
      socket.emit("leaveOrderRoom", orderId);
      socket.off("locationUpdate");
      socket.off("tracking-started");
    };
  }, [orderId, dispatch, token]);

  useEffect(() => {
    if (currentOrder?.handymanLiveLocation?.coordinates) {
      const [lng, lat] = currentOrder.handymanLiveLocation.coordinates;
      if (lat || lng) setHandymanLoc({ latitude: lat, longitude: lng });
    }
  }, [currentOrder]);

  const handleCancel = () => {
    dispatch(updateOrderStatus({ id: orderId, status: "cancelled" }));
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
      <p className="text-sm text-tertiary">
        تم إرسال بلاغك، سيقوم فريق الدعم بمراجعته
      </p>
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

  const handyman = currentOrder.handymanId || {};
  const status = currentOrder.status;

  const Header = ({ title }) => (
    <header className="flex items-center justify-between border-b border-borderGray px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-primary"
        >
          <FaArrowRight size={18} />
        </button>
        <h1 className="font-bold text-primary">{title}</h1>
      </div>
      <div className="flex gap-3 text-primary">
        <FaBell />
        <Link to={`/chat/${orderId}`}>
          <FaComments />
        </Link>
      </div>
    </header>
  );

  // ===== CANCELLED =====
  if (status === "cancelled") {
    return (
      <div className="fixed inset-0 flex flex-col overflow-y-auto bg-white">
        <Header title="الطلب" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaBan className="text-emergency" size={48} />
          <h2 className="text-xl font-bold text-textDark">
            تم إلغاء هذا الطلب
          </h2>
          <div className="card w-full max-w-sm text-right">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">رقم الطلب</span>
              <span className="font-medium text-textDark">
                #{String(orderId).slice(-6)}
              </span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">الخدمة</span>
              <span className="font-medium text-textDark">
                {currentOrder.profession}
              </span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">الحرفي</span>
              <span className="font-medium text-textDark">
                {handyman.name || "—"}
              </span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-textGray">تاريخ الطلب</span>
              <span className="font-medium text-textDark">
                {formatDate(currentOrder.createdAt)}
              </span>
            </div>
          </div>

          {currentOrder.completionImage && (
            <div className="w-full max-w-sm text-right">
              <p className="mb-2 text-sm font-bold text-textDark">
                صورة إثبات إتمام العمل
              </p>
              <img
                src={currentOrder.completionImage}
                alt=""
                className="h-32 w-32 rounded-lg object-cover"
              />
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
  if (status === "pending") {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="بانتظار الحرفي" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaHourglassHalf className="animate-pulse text-primary" size={48} />
          <h2 className="text-xl font-bold text-textDark">تم إرسال طلبك</h2>
          <p className="max-w-xs text-sm text-textGray">
            بانتظار موافقة {handyman.name || "الحرفي"} على طلبك. سيصلك إشعار فور
            قبول الطلب.
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
  if (status === "accepted") {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تأكيد السعر" />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="flex items-center gap-3">
            <img
              src={getDefaultAvatar(handyman.name)}
              alt=""
              className="h-14 w-14 rounded-full object-cover"
            />
            <div className="text-right">
              <p className="font-bold text-textDark">
                {handyman.name || "الحرفي"}
              </p>
              <p className="text-xs text-textGray">قبل طلبك وحدد السعر</p>
            </div>
          </div>
          <div className="card w-full max-w-sm">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold text-primary">
              <FaMoneyBillWave />{" "}
              {formatPrice(currentOrder.price ?? currentOrder.estimatedPrice)}
            </div>
            <p className="mt-1 text-xs text-textGray">
              السعر المقترح لإتمام الخدمة
            </p>
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
  if (status === "price_confirmed" && !currentOrder.isHandymanOnTheWay) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header
          title={
            currentOrder.requestType === "scheduled"
              ? "موعد الطلب"
              : "جاري التجهيز"
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaClock className="text-primary" size={48} />
          {currentOrder.requestType === "scheduled" ? (
            <>
              <h2 className="text-xl font-bold text-textDark">
                لديك موعد محجوز
              </h2>
              <p className="max-w-xs text-sm text-textGray">
                سيتحرك {handyman.name || "الحرفي"} إليك عند اقتراب الموعد وستظهر
                لك خريطة التتبع تلقائياً.
              </p>
              <div className="card w-full max-w-sm">
                <p className="text-sm text-textGray">موعد الطلب</p>
                <p className="font-bold text-textDark">
                  {formatDate(currentOrder.scheduledDate)}
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-textDark">
                تم تأكيد السعر
              </h2>
              <p className="max-w-xs text-sm text-textGray">
                {handyman.name || "الحرفي"} بيستعد للتحرك ناحيتك، هتظهر خريطة
                التتبع فور تحركه.
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

  // ===== ✅ LIVE TRACKING (All other statuses: price_confirmed + on way, in-progress) =====

  if (locationLoading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تتبع الطلب" />
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner text="جاري تحديد موقعك..." />
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="fixed inset-0 flex flex-col bg-white">
        <Header title="تتبع الطلب" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <FaClock className="text-emergency" size={48} />
          <h2 className="text-xl font-bold text-textDark">تعذر تحديد موقعك</h2>
          <p className="text-sm text-textGray">
            الرجاء تفعيل خدمة تحديد الموقع في المتصفح
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <Header title="تتبع الطلب" />

      <div className="relative flex-1">
        {handymanLoc ? (
          <TrackingMap
            customerLocation={location}
            handymanLocation={handymanLoc}
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral">
            <div className="text-center">
              <FaClock className="mx-auto text-4xl text-primary" />
              <p className="mt-2 text-textGray">في انتظار وصول الحرفي...</p>
            </div>
          </div>
        )}

        {handymanLoc && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full border border-primary bg-white px-4 py-2 shadow-md">
            <span className="flex items-center gap-2 text-sm font-medium text-primary">
              <FaClock />
              {eta !== null
                ? `سيصل بعد ${eta} دقيقة`
                : currentOrder.eta
                  ? `سيصل بعد ${currentOrder.eta} دقيقة`
                  : "الحرفي في الطريق"}
            </span>
            {distance !== null && (
              <span className="mr-3 flex items-center gap-1 text-sm text-secondary">
                📏 {distance} كم
              </span>
            )}
          </div>
        )}

        {trafficDelay > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-emergency/10 px-4 py-2 shadow-md">
            <span className="flex items-center gap-2 text-sm font-medium text-emergency">
              ⚠️ تأخر {trafficDelay} دقائق بسبب حركة المرور
            </span>
          </div>
        )}
      </div>

      <div className="rounded-t-2xl border-t border-borderGray bg-white p-4 shadow-lg">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-borderGray" />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <FaCheckCircle className="text-tertiary" />
            <span className="font-bold">
              {status === "in-progress"
                ? "الحرفي يعمل على طلبك"
                : "تم تأكيد السعر — الحرفي في الطريق"}
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
              <p className="font-bold text-textDark">
                {handyman.name || "الحرفي"}
              </p>
              <p className="text-xs text-textGray">
                خبير {currentOrder.profession} معتمد
              </p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-xs text-textGray">رسوم الخدمة</p>
            <p className="font-bold text-textDark">
              {formatPrice(currentOrder.price || currentOrder.estimatedPrice)}
            </p>
            {distance !== null && (
              <>
                <p className="mt-1 text-xs text-textGray">المسافة المتبقية</p>
                <p className="font-bold text-secondary">{distance} كم</p>
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
