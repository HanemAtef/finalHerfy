import { useEffect, useState } from "react";
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
import { connectSocket } from '../../socket/socket';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LocationLabel from '../../components/common/LocationLabel';
import ReasonModal from '../../components/common/ReasonModal';
import AlertMessage from '../../components/common/AlertMessage';
import TrackingMap from '../../components/Map/TrackingMap';
import useCurrentLocation from '../../hooks/useCurrentLocation';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

export default function HandymanOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentOrder, isLoading, error } = useSelector(
    (state) => state.orders
  );

  const { token } = useSelector((state) => state.auth);

  const { location: currentDeviceLocation } = useCurrentLocation();

  const [handymanLoc, setHandymanLoc] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [price, setPrice] = useState("");
  const [completionImage, setCompletionImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  console.log("📍 [HandymanOrderDetails Render]", {
    orderId: id,
    hasCurrentOrder: !!currentOrder,
    handymanLoc,
    currentDeviceLocation,
    customerLocation: currentOrder?.customerLocation,
    routePoints: routeGeometry?.length || 0,
  });

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

  // ===== Live GPS emitter & socket listener =====
  useEffect(() => {
    const isLive =
      currentOrder &&
      ((currentOrder.status === "price_confirmed" &&
        currentOrder.isHandymanOnTheWay) ||
        currentOrder.status === "in-progress");

    console.log("🚦 LIVE STATUS =", isLive);

    if (!navigator.geolocation) {
      console.log("❌ Browser doesn't support Geolocation");
      return;
    }

    if (!token) {
      console.log("❌ No token");
      return;
    }

    const socket = connectSocket(token);

    console.log("🔌 socket.connected =", socket.connected);

    const onConnect = () => {
      console.log("✅ SOCKET CONNECTED");

      if (isLive) {
        console.log("📥 JOIN ROOM", id);
        socket.emit("joinOrderRoom", id);
      }
    };

    socket.off("connect", onConnect);
    socket.on("connect", onConnect);

    if (socket.connected && isLive) {
      console.log("📥 JOIN ROOM", id);
      socket.emit("joinOrderRoom", id);
    }

    const onLocationUpdate = (payload) => {
      console.log("📩 LOCATION UPDATE RECEIVED", payload);

      if (
        Number.isFinite(payload?.lat) &&
        Number.isFinite(payload?.lng)
      ) {
        setHandymanLoc({
          latitude: payload.lat,
          longitude: payload.lng,
        });
      }

      if (Array.isArray(payload?.geometry)) {
        setRouteGeometry(payload.geometry);
      }
    };

    socket.off("locationUpdate", onLocationUpdate);
    socket.on("locationUpdate", onLocationUpdate);

    let lastSent = 0;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        console.log("📍 GPS CALLBACK", position.coords);

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setHandymanLoc({
          latitude: lat,
          longitude: lng,
        });

        if (!isLive) {
          console.log("⛔ Not live yet");
          return;
        }

        if (!socket.connected) {
          console.log("❌ Socket disconnected");
          return;
        }

        const now = Date.now();

        if (now - lastSent < 5000) return;

        lastSent = now;

        console.log("📤 EMIT sendLocation", {
          orderId: id,
          lat,
          lng,
        });

        socket.emit("sendLocation", {
          orderId: id,
          lat,
          lng,
        });
      },
      (err) => {
        console.log("❌ GPS ERROR", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);

      socket.off("connect", onConnect);
      socket.off("locationUpdate", onLocationUpdate);

      if (isLive) {
        socket.emit("leaveOrderRoom", id);
      }
    };
  }, [
    id,
    token,
    currentOrder?.status,
    currentOrder?.isHandymanOnTheWay,
  ]);

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

  // On the way
  const handleOnTheWay = () => {
    dispatch(markOrderOnTheWay(id));
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
            {ORDER_STATUS_LABELS[currentOrder.status]}
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

        {currentOrder.customerLocation?.coordinates &&
          Number.isFinite(
            currentOrder.customerLocation.coordinates[1]
          ) &&
          Number.isFinite(
            currentOrder.customerLocation.coordinates[0]
          ) && (
            <div className="relative mt-4 h-72 w-full overflow-hidden rounded-2xl border border-neutral">

              <TrackingMap
                customerLocation={{
                  latitude:
                    currentOrder.customerLocation.coordinates[1],
                  longitude:
                    currentOrder.customerLocation.coordinates[0],
                }}
                handymanLocation={
                  handymanLoc &&
                  Number.isFinite(handymanLoc.latitude) &&
                  Number.isFinite(handymanLoc.longitude)
                    ? handymanLoc
                    : currentDeviceLocation &&
                        Number.isFinite(
                          currentDeviceLocation.latitude
                        ) &&
                        Number.isFinite(
                          currentDeviceLocation.longitude
                        )
                      ? currentDeviceLocation
                      : null
                }
                routeGeometry={routeGeometry}
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
            <button
              type="button"
              onClick={handleOnTheWay}
              className="btn-primary w-full"
            >
              أنا قادم للعميل
            </button>
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