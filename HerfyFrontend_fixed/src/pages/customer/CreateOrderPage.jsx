import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FaArrowRight, FaMapMarkerAlt, FaBolt, FaCalendarAlt, FaCamera, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { handymanService, uploadService } from '../../services/api';
import { createOrder } from '../../store/slices/orderSlice';
import { fetchCurrentLocation } from '../../store/slices/locationSlice';
import LocationLabel from '../../components/common/LocationLabel';
import { formatPrice } from '../../utils/helpers';

export default function CreateOrderPage() {
  const { handymanId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  // Second location checkpoint: re-fetch a fresh position right when the
  // customer opens the order form, instead of relying on whatever was
  // grabbed once at app launch (they may have moved since then).
  useEffect(() => {
    dispatch(fetchCurrentLocation());
  }, [dispatch]);
  const { latitude, longitude, status: locationStatus } = useSelector((state) => state.location);
  const location = latitude != null ? { latitude, longitude } : null;
  const { user } = useSelector((state) => state.auth);
  const { isLoading, error } = useSelector((state) => state.orders);
  const [handyman, setHandyman] = useState(null);
  const [requestType, setRequestType] = useState('instant');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [images, setImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [penaltyBlock, setPenaltyBlock] = useState(null);

  useEffect(() => {
    handymanService.getById(handymanId).then((res) => setHandyman(res.data)).catch(() => {});
  }, [handymanId]);

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
    if (!location) return;

    const payload = {
      handymanId,
      profession: handyman?.profession || 'سباك',
      description,
      images,
      requestType,
      scheduledDate: requestType === 'scheduled' ? scheduledDate : undefined,
      estimatedPrice: handyman?.price || 200,
      customerLocation: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
      },
    };

    const result = await dispatch(createOrder(payload));
    if (createOrder.fulfilled.match(result)) {
      navigate(`/customer/tracking/${result.payload._id}`);
    } else if (createOrder.rejected.match(result)) {
      const message = result.payload?.msg || '';
      const hasOutstandingPenalty =
        result.payload?.penaltyAmount > 0 || /outstanding penalty/i.test(message);

      if (hasOutstandingPenalty) {
        setPenaltyBlock({
          ...result.payload,
          penaltyAmount: result.payload?.penaltyAmount || user?.penaltyAmount,
        });
      }
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={20} />
        </button>
        <h1 className="text-xl font-bold text-primary">إنشاء طلب</h1>
      </div>

      {error && !penaltyBlock && (
        <div className="mb-4 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">{error}</div>
      )}

      {penaltyBlock && (
        <div className="mb-4 rounded-lg bg-secondary/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-secondary">
            <FaExclamationTriangle />
            <span className="font-bold">غرامة مستحقة</span>
          </div>
          <p className="mb-3 text-sm text-textDark">
            لديك غرامة مستحقة بقيمة {penaltyBlock.penaltyAmount} ج.م. يجب تسوية الغرامة قبل إنشاء طلب جديد.
          </p>
          <Link
            to="/customer/profile"
            className="inline-block rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-white transition-all hover:bg-secondary/90"
          >
            تسوية الغرامة
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {handyman && (
          <div className="card flex items-center gap-4">
            <div className="flex-1">
              <h3 className="font-bold text-primary">{handyman.name}</h3>
              <p className="text-sm text-textGray">{handyman.profession}</p>
              <p className="font-bold text-secondary">{formatPrice(handyman.price)}/ساعة</p>
            </div>
          </div>
        )}

        <div className="card">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <FaMapMarkerAlt />
            <span className="font-bold">تأكيد الموقع</span>
          </div>
          <p className="text-sm text-textGray">
            {location ? (
              <>الموقع الحالي: <LocationLabel lat={location.latitude} lng={location.longitude} icon={false} /></>
            ) : locationStatus === 'denied' ? (
              'تعذر تحديد موقعك — يرجى السماح بالوصول للموقع'
            ) : (
              'جاري تحديد موقعك...'
            )}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">نوع الطلب</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRequestType('instant')}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 py-4 ${
                requestType === 'instant' ? 'border-primary bg-primary/5 text-primary' : 'border-borderGray'
              }`}
            >
              <FaBolt /> فوري
            </button>
            <button
              type="button"
              onClick={() => setRequestType('scheduled')}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 py-4 ${
                requestType === 'scheduled' ? 'border-primary bg-primary/5 text-primary' : 'border-borderGray'
              }`}
            >
              <FaCalendarAlt /> مجدول
            </button>
          </div>
        </div>

        {requestType === 'scheduled' && (
          <div>
            <label className="mb-2 block text-sm font-bold">تاريخ الموعد</label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="input-field"
              required
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-bold">وصف المشكلة</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="input-field resize-none"
            placeholder="صف المشكلة التي تحتاج مساعدة فيها..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">صور المشكلة (اختياري)</label>
          <div className="flex flex-wrap gap-3">
            {images.map((img) => (
              <div key={img} className="group relative">
                <img src={img} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(img)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emergency text-white"
                >
                  <FaTimes size={10} />
                </button>
              </div>
            ))}
            {images.length < 6 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-borderGray text-textGray">
                <FaCamera size={16} />
                <span className="text-[10px]">{uploadingImages ? 'جاري الرفع...' : 'إضافة'}</span>
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

        <button type="submit" disabled={isLoading || !location} className="btn-secondary w-full">
          {isLoading ? 'جاري الإرسال...' : 'تأكيد الطلب'}
        </button>
      </form>
    </div>
  );
}
