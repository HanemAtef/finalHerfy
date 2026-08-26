import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaCamera,
  FaTimes,
  FaExclamationTriangle,
  FaCheckCircle,
  FaUser,
  FaCrosshairs,
} from 'react-icons/fa';
import axios from 'axios';
import { handymanService, uploadService } from '../../services/api';
import { createOrder } from '../../store/slices/orderSlice';
import { fetchCurrentLocation } from '../../store/slices/locationSlice';
import { haversineDistance, getDefaultAvatar, formatPrice } from '../../utils/helpers';
import AlertMessage from '../../components/common/AlertMessage';

export default function CreateOrderPage() {
  const { handymanId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user } = useSelector((state) => state.auth);
  const { isLoading, error } = useSelector((state) => state.orders);
  const [handyman, setHandyman] = useState(null);
  const [serviceAddress, setServiceAddress] = useState('');
  const [currentLocationData, setCurrentLocationData] = useState(null);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  // Fetch current GPS and reverse geocode to Arabic address
  const fetchAndResolveLocation = async () => {
    if (!navigator.geolocation) {
      setLocationError('متصفحك لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    setRefreshingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let resolvedName = '';
        let city = '';
        let area = '';

        try {
          const res = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=ar`,
            { headers: { 'User-Agent': 'HerfyApp/1.0' }, timeout: 8000 }
          );
          const addr = res.data?.address || {};
          area =
            addr.neighbourhood ||
            addr.suburb ||
            addr.quarter ||
            addr.city_district ||
            addr.district ||
            addr.hamlet ||
            addr.borough ||
            addr.county ||
            '';
          city =
            addr.city ||
            addr.town ||
            addr.village ||
            addr.municipality ||
            addr.state ||
            '';
          const road = addr.road || addr.street || addr.pedestrian || addr.footway || '';
          resolvedName = [road, area, city].filter(Boolean).join('، ') || res.data?.display_name || 'موقع محدد عبر الخريطة';
        } catch {
          resolvedName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }

        setCurrentLocationData({
          latitude: lat,
          longitude: lng,
          city,
          area,
          resolvedName,
        });
        setRefreshingLocation(false);
      },
      (err) => {
        setLocationError('يرجى السماح للتطبيق بالوصول إلى موقعك الجغرافي لتحديد مكان تنفيذ الخدمة.');
        setRefreshingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    fetchAndResolveLocation();
    dispatch(fetchCurrentLocation());
  }, []);

  const location = currentLocationData
    ? { latitude: currentLocationData.latitude, longitude: currentLocationData.longitude }
    : null;

  // Format local date-time string YYYY-MM-DDTHH:mm
  const formatLocalInputDateTime = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  // Calculate distance & travel time from handyman Base Location to customer Service Location
  const travelInfo = useMemo(() => {
    const handymanCoords =
      handyman?.location?.coordinates ||
      handyman?.userId?.location?.coordinates;

    if (
      location &&
      Array.isArray(handymanCoords) &&
      handymanCoords.length === 2 &&
      handymanCoords[0] !== 0 &&
      handymanCoords[1] !== 0
    ) {
      const [hLng, hLat] = handymanCoords;
      const cLat = location.latitude;
      const cLng = location.longitude;
      const distKm = haversineDistance(hLat, hLng, cLat, cLng);
      const travelMinutes = Math.max(5, Math.round((distKm / 30) * 60));
      const safetyBuffer = 15;
      const totalLeadMinutes = travelMinutes + safetyBuffer;
      const minAllowed = new Date(Date.now() + totalLeadMinutes * 60 * 1000);

      return {
        distKm: Number(distKm.toFixed(1)),
        travelMinutes,
        totalLeadMinutes,
        minAllowed,
      };
    }

    return {
      distKm: null,
      travelMinutes: 5,
      totalLeadMinutes: 20,
      minAllowed: new Date(Date.now() + 20 * 60 * 1000),
    };
  }, [handyman, location]);

  const getMinDateTime = () => {
    return formatLocalInputDateTime(travelInfo.minAllowed);
  };

  const [scheduledDate, setScheduledDate] = useState(() => formatLocalInputDateTime(new Date(Date.now() + 30 * 60 * 1000)));
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [penaltyBlock, setPenaltyBlock] = useState(null);
  const [schedulingError, setSchedulingError] = useState(null);

  useEffect(() => {
    handymanService.getById(handymanId).then((res) => setHandyman(res.data)).catch(() => {});
  }, [handymanId]);

  useEffect(() => {
    if (travelInfo?.minAllowed) {
      const currentSelected = new Date(scheduledDate);
      if (currentSelected.getTime() < travelInfo.minAllowed.getTime()) {
        setScheduledDate(formatLocalInputDateTime(travelInfo.minAllowed));
      }
    }
  }, [travelInfo]);

  const handleImagesSelected = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    try {
      const res = await uploadService.uploadImages(files);
      setImages((prev) => [...prev, ...res.data.urls].slice(0, 6));
    } finally {
      setUploadingImages(false);
      e.target.value = '';
    }
  };

  const removeImage = (url) => {
    setImages((prev) => prev.filter((img) => img !== url));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentLocationData) {
      setLocationError('يرجى تحديد وتحديث موقعك الحالي أولاً');
      return;
    }
    setSchedulingError(null);

    const now = new Date();
    const selected = new Date(scheduledDate);

    if (selected.getTime() < now.getTime() - 2 * 60 * 1000) {
      setSchedulingError('لا يمكن حجز موعد في وقت سابق. يرجى اختيار موعد قادم.');
      return;
    }

    if (selected.getTime() < travelInfo.minAllowed.getTime() - 2 * 60 * 1000) {
      const timeOpts = { hour: '2-digit', minute: '2-digit' };
      const minTimeStr = travelInfo.minAllowed.toLocaleTimeString('ar-EG', timeOpts);
      const minDateStr = travelInfo.minAllowed.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
      setSchedulingError(
        `الوقت المحدد غير كافٍ لوصول الحرفي إلى موقعك${travelInfo.distKm ? ` (${travelInfo.distKm} كم)` : ''}. يستغرق الوصول حوالي (${travelInfo.travelMinutes} دقيقة) بالإضافة إلى 15 دقيقة للتجهيز. أقرب موعد متاح هو: ${minTimeStr} (${minDateStr}).`
      );
      return;
    }

    const fullFormattedAddress = serviceAddress.trim()
      ? `${currentLocationData.resolvedName} - ${serviceAddress.trim()}`
      : currentLocationData.resolvedName;

    const payload = {
      handymanId,
      profession: handyman?.profession || 'سباك',
      description,
      images,
      scheduledDate: new Date(scheduledDate).toISOString(),
      orderLocation: {
        type: 'Point',
        coordinates: [currentLocationData.longitude, currentLocationData.latitude],
        latitude: currentLocationData.latitude,
        longitude: currentLocationData.longitude,
        address: fullFormattedAddress,
        city: currentLocationData.city,
        area: currentLocationData.area,
      },
      customerLocation: {
        type: 'Point',
        coordinates: [currentLocationData.longitude, currentLocationData.latitude],
        address: fullFormattedAddress,
      },
    };

    const result = await dispatch(createOrder(payload));
    if (createOrder.fulfilled.match(result)) {
      navigate(`/customer/orders/${result.payload._id}`);
    } else if (createOrder.rejected.match(result)) {
      const message = result.payload?.msg || '';
      const hasOutstandingPenalty =
        result.payload?.penaltyAmount > 0 || /outstanding penalty/i.test(message);

      if (hasOutstandingPenalty) {
        setPenaltyBlock({
          ...result.payload,
          penaltyAmount: result.payload?.penaltyAmount || user?.penaltyAmount,
        });
      } else if (/تعارض|conflict/i.test(message)) {
        setSchedulingError(message || 'يوجد تعارض في المواعيد مع طلب آخر لدى الحرفي. يرجى اختيار توقيت آخر.');
      } else {
        setSchedulingError(message || 'تعذر إرسال الطلب، يرجى المحاولة مرة أخرى.');
      }
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-borderGray text-primary hover:bg-neutral transition-colors shadow-sm"
        >
          <FaArrowRight size={13} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-textDark">إرسال طلب خدمة</h1>
          <p className="text-xs text-textGray mt-0.5">حدد مكان تنفيذ الخدمة والموعد المطلوب لتلقي عرض السعر</p>
        </div>
      </div>

      {error && !penaltyBlock && !schedulingError && (
        <AlertMessage type="error" message={error} />
      )}

      {schedulingError && (
        <div className="rounded-2xl bg-emergency/5 border border-emergency/20 p-4 text-emergency">
          <div className="flex items-center gap-2 font-bold text-sm mb-1">
            <FaExclamationTriangle />
            <span>تعارض أو عدم كفاية الوقت</span>
          </div>
          <p className="text-xs leading-relaxed">{schedulingError}</p>
        </div>
      )}

      {penaltyBlock && (
        <div className="rounded-2xl bg-secondary/10 border border-secondary/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-secondary font-bold text-sm">
            <FaExclamationTriangle />
            <span>غرامة مستحقة</span>
          </div>
          <p className="mb-3 text-xs text-textDark leading-relaxed">
            لديك غرامة مستحقة بقيمة <span className="font-bold text-secondary">{penaltyBlock.penaltyAmount} ج.م</span>. يرجى تسوية الغرامة قبل إنشاء طلب جديد.
          </p>
          <Link
            to="/customer/profile"
            className="inline-block rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-white transition-all hover:bg-secondary/90 shadow-sm"
          >
            تسوية الغرامة الآن
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Handyman summary */}
        {handyman && (
          <div className="card flex items-center gap-3.5 border-r-4 border-r-primary">
            <img
              src={handyman.profileImage || getDefaultAvatar(handyman.name)}
              alt=""
              className="h-12 w-12 rounded-2xl object-cover border border-borderGray/60"
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-textDark text-sm truncate">{handyman.name}</h2>
              <p className="text-xs text-primary font-semibold mt-0.5">{handyman.profession}</p>
              {travelInfo.distKm != null && (
                <p className="text-[11px] font-bold text-secondary mt-0.5">
                  📍 يبعد عنك: {travelInfo.distKm} كم (حوالي {travelInfo.travelMinutes} دقيقة)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Service Location card */}
        <div className="card space-y-3 border-r-4 border-r-secondary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary font-bold text-xs">
              <FaMapMarkerAlt size={13} className="text-secondary" />
              <span>مكان تنفيذ الخدمة (موقع الطلب)</span>
            </div>
            <button
              type="button"
              onClick={fetchAndResolveLocation}
              disabled={refreshingLocation}
              className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
              title="تحديث الإحداثيات والعنوان عبر GPS"
            >
              <FaCrosshairs className={refreshingLocation ? "animate-spin" : ""} size={12} />
              <span>{refreshingLocation ? 'جاري التحديد...' : 'تحديث موقعي الحالي'}</span>
            </button>
          </div>

          <div className="text-xs text-textDark font-medium bg-neutral/60 p-3.5 rounded-2xl border border-neutral space-y-1.5">
            {currentLocationData ? (
              <>
                <div className="flex items-center gap-1.5 font-bold text-textDark">
                  <span className="text-textGray font-normal">موقع الخدمة:</span>
                  <span className="text-primary font-extrabold">{currentLocationData.resolvedName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-textGray font-mono">
                  <span>الإحداثيات:</span>
                  <span className="font-bold text-textDark">
                    {currentLocationData.latitude.toFixed(5)}, {currentLocationData.longitude.toFixed(5)}
                  </span>
                </div>
              </>
            ) : locationError ? (
              <span className="text-emergency">{locationError}</span>
            ) : (
              <div className="flex items-center gap-2 text-textGray">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>جاري تحديد موقعك الجغرافي واستخراج العنوان...</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-textDark">
              تفاصيل إضافية للعنوان / رقم الشقة والشارع (اختياري)
            </label>
            <input
              value={serviceAddress}
              onChange={(e) => setServiceAddress(e.target.value)}
              className="input-field text-xs"
              placeholder="مثال: عمارة 12، الدور الرابع، شقة 8، بجوار مسجد النور"
            />
          </div>
        </div>

        {/* Date & Time Selection */}
        <div className="card space-y-3">
          <label className="flex items-center gap-2 text-xs font-bold text-textDark">
            <FaCalendarAlt className="text-primary" size={13} />
            <span>تاريخ ووقت بدء الخدمة المطلوب</span>
          </label>
          <input
            type="datetime-local"
            value={scheduledDate}
            min={getMinDateTime()}
            onChange={(e) => {
              setScheduledDate(e.target.value);
              setSchedulingError(null);
            }}
            className="input-field text-sm"
            required
          />
          {travelInfo.distKm != null && (
            <p className="text-[11px] text-textGray leading-relaxed bg-neutral p-2.5 rounded-xl">
              ⏱️ المسافة التقديرية للحرفي: <span className="font-bold text-textDark">{travelInfo.distKm} كم</span> (وقت السفر المتوقع: حوالي {travelInfo.travelMinutes} دقيقة + 15 دقيقة للتجهيز).
            </p>
          )}
        </div>

        {/* Description */}
        <div className="card space-y-2">
          <label className="block text-xs font-bold text-textDark">وصف المشكلة أو تفاصيل العمل</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input-field resize-none text-sm"
            placeholder="اشرح المشكلة أو الخدمة المطلوبة بالتفصيل (مثل: تصليح صنبور المطبخ المسرب)..."
            required
          />
        </div>

        {/* Images upload */}
        <div className="card space-y-2.5">
          <label className="block text-xs font-bold text-textDark">صور توضيحية للمشكلة (اختياري - حتى 6 صور)</label>
          <div className="flex flex-wrap gap-2.5">
            {images.map((img) => (
              <div key={img} className="group relative">
                <img src={img} alt="" className="h-16 w-16 rounded-xl object-cover border border-borderGray" />
                <button
                  type="button"
                  onClick={() => removeImage(img)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emergency text-white shadow-sm"
                >
                  <FaTimes size={9} />
                </button>
              </div>
            ))}
            {images.length < 6 && (
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-borderGray text-textGray hover:border-primary hover:text-primary transition-all">
                <FaCamera size={14} />
                <span className="text-[10px] font-semibold">{uploadingImages ? '...' : 'إضافة'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadingImages}
                  onChange={handleImagesSelected}
                />
              </label>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !location}
          className="btn-secondary w-full py-3 text-sm font-bold shadow-md shadow-secondary/20 transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
        >
          {isLoading ? 'جاري إرسال الطلب...' : 'إرسال طلب الخدمة للحرفي'}
        </button>
      </form>
    </div>
  );
}
