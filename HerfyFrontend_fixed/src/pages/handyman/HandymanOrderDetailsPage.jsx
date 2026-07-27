import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  FaArrowRight,
  FaMapMarkerAlt,
  FaPhone,
  FaComments,
  FaCheck,
  FaTimes,
  FaCamera,
  FaFlag,
  FaBan,
} from 'react-icons/fa';
import { fetchOrderById, updateOrderStatus, confirmOrderPayment, markOrderOnTheWay } from '../../store/slices/orderSlice';
import { uploadService, reportService } from '../../services/api';
import { connectSocket } from '../../socket/socket';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LocationLabel from '../../components/common/LocationLabel';
import ReasonModal from '../../components/common/ReasonModal';
import { formatDate, formatPrice, ORDER_STATUS_LABELS } from '../../utils/helpers';

export default function HandymanOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { currentOrder, isLoading, error } = useSelector((state) => state.orders);
  const { token } = useSelector((state) => state.auth);

  const [price, setPrice] = useState('');
  const [completionImage, setCompletionImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  useEffect(() => {
    dispatch(fetchOrderById(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (currentOrder?.estimatedPrice) setPrice(String(currentOrder.estimatedPrice));
  }, [currentOrder?.estimatedPrice]);

  // ===== Live GPS emitter =====
  // Nothing was ever pushing the handyman's real position to the customer's
  // tracking map — this is the actual reason the map "never showed" during a
  // live job. Once the handyman is on the way (or already working), join the
  // order's socket room and stream position updates every few seconds.
  useEffect(() => {
    const isLive = currentOrder && (
      (currentOrder.status === 'price_confirmed' && currentOrder.isHandymanOnTheWay) ||
      currentOrder.status === 'in-progress'
    );
    if (!isLive || !navigator.geolocation || !token) return undefined;

    const socket = connectSocket(token);

    socket.emit('joinOrderRoom', id);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        socket.emit('sendLocation', {
          orderId: id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      socket.emit('leaveOrderRoom', id);
    };
  }, [id, currentOrder?.status, currentOrder?.isHandymanOnTheWay, token]);

  const handleStatus = (status, extra = {}) => {
    dispatch(updateOrderStatus({ id, status, ...extra })).then((result) => {
      if (status === 'accepted' && updateOrderStatus.fulfilled.match(result)) {
        navigate('/handyman/dashboard');
      }

    });
  };

  const handleAccept = () => {
    const numericPrice = Number(price);
    if (!numericPrice || numericPrice <= 0) return;
    handleStatus('accepted', { price: numericPrice });
  };

  const handleCompletionImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadService.uploadImage(file);
      setCompletionImage(res.data.url);
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = () => {
    if (!completionImage) return;
    handleStatus('completed', { completionImage });
  };

  const handleConfirmPayment = () => {
    dispatch(confirmOrderPayment(id));
  };

  const handleOnTheWay = () => {
    dispatch(markOrderOnTheWay(id));
  };

  const handleReport = async (reason) => {
    await reportService.fileReport(id, { reason });
    setReportSent(true);
    dispatch(fetchOrderById(id));
  };

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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="text-primary">
          <FaArrowRight size={20} />
        </button>
        <h1 className="text-xl font-bold text-primary">تفاصيل الطلب</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-emergency/10 px-4 py-3 text-sm text-emergency">{error}</div>
      )}

      {currentOrder.status === 'cancelled' && (
        <div className="card mb-4 flex items-center gap-3 border-r-4 border-emergency bg-emergency/5">
          <FaBan className="shrink-0 text-emergency" size={20} />
          <p className="text-sm text-textDark">تم إلغاء هذا الطلب. المحادثة مغلقة الآن.</p>
        </div>
      )}

      {currentOrder.status === 'disputed' && (
        <div className="card mb-4 flex items-center gap-3 border-r-4 border-secondary bg-secondary/5">
          <FaFlag className="shrink-0 text-secondary" size={20} />
          <p className="text-sm text-textDark">هذا الطلب قيد مراجعة بلاغ من فريق الدعم. المحادثة مغلقة مؤقتاً.</p>
        </div>
      )}

      <div className="card mb-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
            #{String(id).slice(-5)}
          </span>
          <span className="text-sm font-medium text-secondary">
            {ORDER_STATUS_LABELS[currentOrder.status]}
          </span>
        </div>

        <h2 className="mb-2 text-lg font-bold text-textDark">{currentOrder.profession}</h2>
        <p className="mb-4 text-sm text-textGray">{currentOrder.description || 'لا يوجد وصف'}</p>

        {currentOrder.images?.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {currentOrder.images.map((img) => (
              <img key={img} src={img} alt="" className="h-16 w-16 rounded-lg object-cover" />
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-borderGray pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-textGray">العميل</span>
            <span className="font-medium">{currentOrder.customerId?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-textGray">التاريخ</span>
            <span>{formatDate(currentOrder.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-textGray">نوع الطلب</span>
            <span>{currentOrder.requestType === 'scheduled' ? 'مجدول' : 'فوري'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-textGray">السعر المقدر من العميل</span>
            <span className="font-bold text-secondary">{formatPrice(currentOrder.estimatedPrice)}</span>
          </div>
          {currentOrder.price != null && (
            <div className="flex justify-between">
              <span className="text-textGray">السعر الذي حددته</span>
              <span className="font-bold text-secondary">{formatPrice(currentOrder.price)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex items-center gap-2 text-primary mb-2">
          <FaMapMarkerAlt />
          <span className="font-bold">موقع العميل</span>
        </div>
        <p className="text-sm text-textGray">
          {currentOrder.customerLocation?.coordinates ? (
            <LocationLabel
              lat={currentOrder.customerLocation.coordinates[1]}
              lng={currentOrder.customerLocation.coordinates[0]}
              icon={false}
            />
          ) : (
            'غير محدد'
          )}
        </p>
      </div>

      {/* Accepting requires setting a price first — this is what the customer
          will be asked to confirm on the next step, so it can't be skipped. */}
      {currentOrder.status === 'pending' && (
        <div className="card mb-4">
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
              disabled={!price || Number(price) <= 0 || isLoading}
              className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaCheck /> قبول وإرسال السعر
            </button>
            <button
              type="button"
              onClick={() => handleStatus('cancelled')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-emergency py-3 font-bold text-emergency"
            >
              <FaTimes /> رفض
            </button>
          </div>
        </div>
      )}

      {currentOrder.status === 'accepted' && (
        <div className="card mb-4 text-center text-sm text-textGray">
          بانتظار موافقة العميل على السعر ({formatPrice(currentOrder.price)})
        </div>
      )}

      {currentOrder.status === 'price_confirmed' && (
        <div className="card mb-4">
          {currentOrder.requestType === 'scheduled' && (
            <p className="mb-3 text-sm text-textGray">
              موعد الطلب: {formatDate(currentOrder.scheduledDate)}
            </p>
          )}
          {!currentOrder.isHandymanOnTheWay ? (
            <button type="button" onClick={handleOnTheWay} className="btn-primary w-full">
              أنا قادم للعميل
            </button>
          ) : (
            <>
              <p className="mb-3 text-center text-sm text-textGray">
                تم تفعيل تتبع موقعك للعميل
              </p>
              <button
                type="button"
                onClick={() => handleStatus('in-progress')}
                className="btn-primary w-full"
              >
                بدء التنفيذ
              </button>
            </>
          )}
        </div>
      )}

      {/* Completing requires a proof-of-completion photo — the backend now
          rejects a "completed" transition without one. */}
      {currentOrder.status === 'in-progress' && (
        <div className="card mb-4">
          <label className="mb-2 block text-sm font-bold text-textDark">
            صورة إثبات إتمام العمل (مطلوبة)
          </label>
          {completionImage ? (
            <img src={completionImage} alt="" className="mb-3 h-32 w-32 rounded-lg object-cover" />
          ) : (
            <label className="mb-3 flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-borderGray text-textGray">
              <FaCamera size={20} />
              <span className="text-xs">{uploading ? 'جاري الرفع...' : 'إضافة صورة'}</span>
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

      <div className="flex flex-wrap gap-3">
        <a href={`tel:${currentOrder.customerId?.phone}`} className="btn-outline flex items-center justify-center gap-2 flex-1">
          <FaPhone /> اتصال
        </a>
        <Link to={`/chat/${id}`} className="btn-outline flex items-center justify-center gap-2 flex-1">
          <FaComments /> محادثة
        </Link>
      </div>

      {/* Cash payment: after finishing the job the handyman collects cash
          from the customer, then confirms it in the app. */}
      {currentOrder.status === 'completed' && (
        <div className="card mt-4">
          {currentOrder.completionImage && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-bold text-textDark">صورة إثبات إتمام العمل</p>
              <img src={currentOrder.completionImage} alt="" className="h-40 w-40 rounded-lg object-cover" />
            </div>
          )}
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-textDark">الدفع</span>
            <span
              className={`rounded-lg px-3 py-1 text-sm font-bold ${
                currentOrder.paymentStatus === 'paid'
                  ? 'bg-secondary/10 text-secondary'
                  : 'bg-emergency/10 text-emergency'
              }`}
            >
              {currentOrder.paymentStatus === 'paid' ? 'تم الدفع' : 'لم يتم الدفع بعد'}
            </span>
          </div>
          {currentOrder.paymentStatus !== 'paid' ? (
            <>
              <p className="mb-3 text-sm text-textGray">
                استلم المبلغ نقداً من العميل ({formatPrice(currentOrder.price)}) ثم أكّد الاستلام هنا.
              </p>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isLoading}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                تأكيد استلام الدفع نقداً
              </button>
            </>
          ) : (
            <p className="text-sm text-textGray">
              تم استلام المبلغ بتاريخ {formatDate(currentOrder.paidAt)}
            </p>
          )}
        </div>
      )}
      {['completed', 'cancelled', 'in-progress', 'price_confirmed'].includes(currentOrder.status) && (
        <div className="mt-4 text-center">
          {reportSent ? (
            <p className="text-sm text-tertiary">تم إرسال بلاغك، سيقوم فريق الدعم بمراجعته</p>
          ) : (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 text-sm text-emergency hover:underline"
            >
              <FaFlag size={12} /> الإبلاغ عن مشكلة في هذا الطلب
            </button>
          )}
        </div>
      )}

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
